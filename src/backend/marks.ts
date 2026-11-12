import { existsSync, rmSync } from 'node:fs'
import type { Batch, MarkRequest, TrashFailure, TrashResult } from '@shared/model'
import { nowIso, transaction, type Database } from './db'
import { clearDecision, decisionOf, emptyDecision, writeDecision, type Decision } from './decisions'
import { partialHash } from './hashing'
import { logError, logInfo } from './log'
import { restoreFromRecycleBin, sendToRecycleBin } from './recycle'
import { pathByFileId } from './win32'

/** Marcas en lote, Papelera y Deshacer (F-4, F-6, F-19, M-6). Cada acción del usuario es un lote. */

export function createBatch(db: Database, description: string): number {
  return Number(db.prepare('INSERT INTO batch(created_at, description) VALUES (?, ?)').run(nowIso(), description).lastInsertRowid)
}

export function recordItem(db: Database, batchId: number, fileId: number, fields: { before?: Decision | null; trashedFrom?: string; movedFrom?: string; movedTo?: string; copiedTo?: string }): void {
  db.prepare('INSERT INTO batch_item(batch_id, file_id, before_decision, trashed_from, moved_from, moved_to, copied_to) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    batchId, fileId, fields.before === undefined ? null : JSON.stringify(fields.before), fields.trashedFrom ?? null, fields.movedFrom ?? null, fields.movedTo ?? null, fields.copiedTo ?? null
  )
}

interface FileForMark {
  file_id: number
  path: string
  size_bytes: number
}

/**
 * Pone la misma marca a varios archivos. Para «Eliminar el…» se guarda la huella y el tamaño de ese momento: el día
 * de la fecha se comparan antes de borrar (§5.3). La nota y la fecha de vencimiento de la marca anterior se conservan.
 */
export async function applyMarks(db: Database, request: MarkRequest, description: string, source: Decision['source'] = 'manual'): Promise<number> {
  const files = request.fileIds.map((fileId) => db.prepare('SELECT file_id, path, size_bytes FROM file WHERE file_id = ?').get(fileId) as FileForMark | undefined).filter((file): file is FileForMark => !!file)
  const fingerprints = new Map<number, string | null>()
  if (request.action === 'deleteOn') {
    for (const file of files) fingerprints.set(file.file_id, await partialHash(file.path).catch(() => null))
  }
  return transaction(db, () => {
    const batchId = createBatch(db, description)
    for (const file of files) {
      const before = decisionOf(db, file.file_id)
      recordItem(db, batchId, file.file_id, { before })
      if (request.action === 'unreviewed') {
        clearDecision(db, file.file_id)
        continue
      }
      writeDecision(db, file.file_id, {
        ...emptyDecision(source),
        action: request.action,
        due_date: request.action === 'deleteOn' || request.action === 'review' ? request.dueDate : null,
        expires_on: request.action === 'keep' ? request.expiresOn : null,
        note: before?.note ?? '',
        batch_id: batchId,
        content_hash_at_decision: fingerprints.get(file.file_id) ?? null,
        size_at_decision: request.action === 'deleteOn' ? file.size_bytes : null
      })
    }
    return batchId
  })
}

export function setNote(db: Database, fileId: number, note: string): void {
  const current = decisionOf(db, fileId) ?? emptyDecision('manual')
  writeDecision(db, fileId, { ...current, note })
}

export function listBatches(db: Database, limit = 30): Batch[] {
  const rows = db.prepare(`SELECT b.batch_id, b.description, b.created_at, b.undone_at, count(i.file_id) AS files
    FROM batch b LEFT JOIN batch_item i USING (batch_id) GROUP BY b.batch_id ORDER BY b.batch_id DESC LIMIT ?`).all(limit) as { batch_id: number; description: string; created_at: string; undone_at: string | null; files: number }[]
  return rows.map((row) => ({ batchId: row.batch_id, description: row.description, createdAt: row.created_at, undoneAt: row.undone_at, files: row.files }))
}

export function lastUndoableBatch(db: Database): number | null {
  const row = db.prepare('SELECT batch_id FROM batch WHERE undone_at IS NULL ORDER BY batch_id DESC LIMIT 1').get() as { batch_id: number } | undefined
  return row?.batch_id ?? null
}

interface FileLocation {
  file_id: number
  path: string
  name: string
  fs_file_ref: string
  mount_path: string
  has_recycle_bin: number
}

function locate(db: Database, fileId: number): FileLocation | undefined {
  return db.prepare('SELECT f.file_id, f.path, f.name, f.fs_file_ref, v.mount_path, v.has_recycle_bin FROM file f JOIN volume v USING (volume_id) WHERE f.file_id = ?').get(fileId) as FileLocation | undefined
}

/** Ruta actual: la del índice si sigue ahí; si no, la que da el File ID (se movió en el mismo disco). */
export function currentPath(file: { path: string; fs_file_ref: string; mount_path: string }): string | null {
  if (existsSync(file.path)) return file.path
  return pathByFileId(file.mount_path, BigInt(file.fs_file_ref))
}

const FAILURE_BY_ERRNO: Record<string, TrashFailure> = { ENOENT: 'missing', EBUSY: 'locked', EPERM: 'denied', EACCES: 'denied' }

function failureOf(error: unknown): TrashFailure {
  const code = (error as NodeJS.ErrnoException).code
  return (code && FAILURE_BY_ERRNO[code]) || 'other'
}

/**
 * Envía a la Papelera; en un disco sin Papelera borra definitivamente, y eso solo si la interfaz pasó la
 * confirmación fuerte (`confirmedPermanent` = número de archivos escrito por el usuario, F-19).
 */
export async function trashFiles(db: Database, fileIds: number[], description: string, confirmedPermanent: number | null): Promise<TrashResult> {
  const files = fileIds.map((fileId) => locate(db, fileId)).filter((file): file is FileLocation => !!file)
  const permanent = files.filter((file) => file.has_recycle_bin === 0)
  if (permanent.length > 0 && confirmedPermanent !== permanent.length) {
    throw new Error(`${permanent.length} archivos están en un disco sin Papelera: hace falta la confirmación fuerte.`)
  }
  const failed: TrashResult['failed'] = []
  const resolved = files.map((file) => ({ file, path: currentPath(file) }))
  for (const { file, path } of resolved) if (!path) failed.push({ name: file.name, reason: 'missing' })
  const toRecycle = resolved.filter((entry) => entry.path && entry.file.has_recycle_bin === 1)
  const toDelete = resolved.filter((entry) => entry.path && entry.file.has_recycle_bin === 0)

  const results = await sendToRecycleBin(toRecycle.map((entry) => entry.path!))
  const done: { fileId: number; path: string; permanent: boolean }[] = []
  results.forEach((result, index) => {
    const entry = toRecycle[index]!
    if (result.ok) {
      if (result.permanent) logInfo('trash.permanent', 'la Papelera no lo recibió: quedó borrado en definitiva', `archivo ${entry.file.file_id}`)
      done.push({ fileId: entry.file.file_id, path: entry.path!, permanent: result.permanent === true })
      return
    }
    logError('trash', result.detail ?? result.error, `archivo ${entry.file.file_id}`)
    failed.push({ name: entry.file.name, reason: result.error ?? 'other' })
  })
  for (const entry of toDelete) {
    try {
      rmSync(entry.path!)
      done.push({ fileId: entry.file.file_id, path: entry.path!, permanent: true })
    } catch (error) {
      logError('delete.permanent', error, `archivo ${entry.file.file_id}`)
      failed.push({ name: entry.file.name, reason: failureOf(error) })
    }
  }
  if (done.length === 0) return { batchId: null, trashed: 0, deleted: 0, failed }
  const batchId = transaction(db, () => {
    const id = createBatch(db, description)
    for (const item of done) {
      recordItem(db, id, item.fileId, { before: decisionOf(db, item.fileId), trashedFrom: item.permanent ? undefined : item.path })
      db.prepare("UPDATE file SET presence = 'missing' WHERE file_id = ?").run(item.fileId)
      db.prepare("UPDATE file_decision SET closed_reason = ? WHERE file_id = ?").run(item.permanent ? 'deleted' : 'trashed', item.fileId)
      db.prepare("UPDATE rule_match SET resolution = 'accepted' WHERE file_id = ? AND resolution = 'pending'").run(item.fileId)
    }
    return id
  })
  logInfo('batch.trashed', `${done.length} archivos, ${failed.length} fallidos`, `lote ${batchId}`)
  return { batchId, trashed: done.filter((item) => !item.permanent).length, deleted: done.filter((item) => item.permanent).length, failed }
}

interface BatchItemRecord {
  file_id: number
  before_decision: string | null
  trashed_from: string | null
  moved_from: string | null
  moved_to: string | null
  copied_to: string | null
}

/** M-6: restaura las marcas, saca de la Papelera lo que siga ahí y devuelve lo movido. Dice qué no pudo deshacer. */
export async function undoBatch(db: Database, batchId: number, moveBack: (from: string, to: string) => void, removeCopy: (path: string) => void): Promise<{ restored: number; failed: string[] }> {
  const batch = db.prepare('SELECT undone_at FROM batch WHERE batch_id = ?').get(batchId) as { undone_at: string | null } | undefined
  if (!batch) throw new Error(`Lote inexistente: ${batchId}`)
  if (batch.undone_at) throw new Error(`El lote ${batchId} ya se deshizo.`)
  const items = db.prepare('SELECT * FROM batch_item WHERE batch_id = ?').all(batchId) as unknown as BatchItemRecord[]
  const failed: string[] = []
  const trashed = items.filter((item) => item.trashed_from)
  const restoreResults = await restoreFromRecycleBin(trashed.map((item) => item.trashed_from!))
  for (const result of restoreResults) if (!result.ok) logError('undo.restore', result.detail ?? result.error, result.path)
  const restoredPaths = new Set(restoreResults.filter((result) => result.ok).map((result) => result.path))
  for (const item of trashed) if (!restoredPaths.has(item.trashed_from!)) failed.push(item.trashed_from!)
  for (const item of items) {
    if (item.moved_from && item.moved_to) {
      try {
        moveBack(item.moved_to, item.moved_from)
      } catch (error) {
        logError('undo.move', error, item.moved_to)
        failed.push(item.moved_to)
      }
    }
    if (item.copied_to) removeCopy(item.copied_to)
  }
  transaction(db, () => {
    for (const item of items) {
      const before = item.before_decision ? (JSON.parse(item.before_decision) as Decision | null) : null
      if (item.before_decision !== null) {
        if (before) writeDecision(db, item.file_id, before)
        else db.prepare('DELETE FROM file_decision WHERE file_id = ?').run(item.file_id)
      }
      if (item.trashed_from && restoredPaths.has(item.trashed_from)) {
        db.prepare("UPDATE file SET presence = 'present', path = ? WHERE file_id = ?").run(item.trashed_from, item.file_id)
      }
      if (item.moved_from) db.prepare('UPDATE file SET path = ?, name = ? WHERE file_id = ?').run(item.moved_from, baseName(item.moved_from), item.file_id)
    }
    db.prepare('UPDATE batch SET undone_at = ? WHERE batch_id = ?').run(nowIso(), batchId)
  })
  return { restored: items.length - failed.length, failed }
}

const baseName = (path: string) => path.slice(path.lastIndexOf('\\') + 1)
