import { existsSync } from 'node:fs'
import { opendir, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { effectiveFilter, extensionOf, isIncluded } from '@shared/extensions'
import { FolderMarkSchema, type ExtensionFilter, type FolderMark } from '@shared/model'
import { nowIso, today, transaction, type Database } from './db'
import { decisionFromFolderMark, decisionOf, writeDecision } from './decisions'
import { logError, logInfo } from './log'
import { inferProvenance, INFERENCE_VERSION, readZoneIdentifier } from './provenance'
import { readRecentOpenings } from './recent'
import { globalExtensionFilter, rootFilterOrNull, rootRecord } from './roots'

/**
 * Reconciliación (F-1): recorre la carpeta comparando tamaño y fecha, sin abrir archivos, y pone el índice al día.
 * Un archivo se reconoce por volumen + File ID (`stat().ino`): renombrado o movido dentro del disco conserva su fila
 * y su marca (M-2).
 */
export interface ScanSummary {
  rootId: number
  seen: number
  added: number
  updated: number
  missing: number
  unreadable: number
  paused: boolean
}

interface Found {
  path: string
  ref: string
  size: number
  modifiedAt: string
}

/** Los cambios se escriben de a tantos archivos por transacción: el backend sigue respondiendo mientras recorre. */
const WRITE_CHUNK = 500

export async function reconcileRoot(db: Database, rootId: number, openings = readRecentOpenings()): Promise<ScanSummary> {
  const root = rootRecord(db, rootId)
  const summary: ScanSummary = { rootId, seen: 0, added: 0, updated: 0, missing: 0, unreadable: 0, paused: false }
  if (!existsSync(root.path)) {
    // disco desconectado o carpeta inaccesible: sus archivos quedan en pausa, no perdidos
    pauseRoot(db, rootId, root.volume_id, existsSync(root.mount_path))
    summary.paused = true
    return summary
  }
  db.prepare('UPDATE volume SET online = 1 WHERE volume_id = ?').run(root.volume_id)
  const filter = effectiveFilter(globalExtensionFilter(db), rootFilterOrNull(db, rootId))
  const excludes = (JSON.parse(root.exclude_globs) as string[]).map(globToRegExp)
  const folderMark = FolderMarkSchema.parse(JSON.parse(root.folder_mark))
  const scanStartedAt = indexStamp()
  db.prepare('DELETE FROM root_error WHERE root_id = ?').run(rootId)

  let pending: Found[] = []
  const flush = () => {
    const chunk = pending
    pending = []
    transaction(db, () => chunk.forEach((found) => upsertFile(db, root.volume_id, rootId, found, filter, folderMark, openings, summary)))
  }
  for await (const found of walk(root.path, excludes, (path, error) => recordUnreadable(db, rootId, path, error, summary))) {
    summary.seen++
    pending.push(found)
    if (pending.length >= WRITE_CHUNK) flush()
  }
  flush()
  summary.missing = markMissing(db, rootId, scanStartedAt)
  logInfo('reconcile.done', `vistos ${summary.seen}, nuevos ${summary.added}, cambiados ${summary.updated}, desaparecidos ${summary.missing}`, `carpeta ${rootId}`)
  return summary
}

async function* walk(folder: string, excludes: RegExp[], onError: (path: string, error: unknown) => void): AsyncGenerator<Found> {
  let directory
  try {
    directory = await opendir(folder)
  } catch (error) {
    onError(folder, error)
    return
  }
  for await (const entry of directory) {
    if (excludes.some((pattern) => pattern.test(entry.name))) continue
    const path = join(folder, entry.name)
    if (entry.isDirectory()) {
      yield* walk(path, excludes, onError)
      continue
    }
    if (!entry.isFile()) continue
    try {
      const info = await stat(path, { bigint: true })
      yield { path, ref: String(info.ino), size: Number(info.size), modifiedAt: new Date(Number(info.mtimeMs)).toISOString() }
    } catch (error) {
      onError(path, error)
    }
  }
}

interface FileRecord {
  file_id: number
  size_bytes: number
  modified_at: string
  presence: string
  path: string
}

function upsertFile(db: Database, volumeId: number, rootId: number, found: Found, filter: ExtensionFilter, folderMark: FolderMark,
  openings: Map<string, string>, summary: ScanSummary): void {
  const name = basename(found.path)
  const extension = extensionOf(name, filter.extensions)
  const openedAt = openings.get(found.path.toLowerCase()) ?? null
  const existing = db.prepare('SELECT file_id, size_bytes, modified_at, presence, path FROM file WHERE volume_id = ? AND fs_file_ref = ?').get(volumeId, found.ref) as FileRecord | undefined
  const included = isIncluded(extension, filter)
  if (!existing) {
    if (!included) return
    const inserted = db.prepare(`INSERT INTO file(volume_id, fs_file_ref, root_id, path, name, extension, size_bytes, modified_at, opened_at, opened_source, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(volumeId, found.ref, rootId, found.path, name, extension, found.size, found.modifiedAt, openedAt, openedAt ? 'recent' : null, indexStamp())
    const fileId = Number(inserted.lastInsertRowid)
    recordProvenance(db, fileId, found.path)
    inheritFromFolder(db, fileId, rootId, folderMark, openedAt ?? found.modifiedAt)
    summary.added++
    return
  }
  const changed = existing.size_bytes !== found.size || existing.modified_at !== found.modifiedAt
  const presence = included ? 'present' : keepsUserData(db, existing.file_id) ? 'filtered_out' : null
  if (presence === null) {
    db.prepare('DELETE FROM file WHERE file_id = ?').run(existing.file_id)
    return
  }
  db.prepare(`UPDATE file SET root_id = ?, path = ?, name = ?, extension = ?, size_bytes = ?, modified_at = ?, presence = ?, loose = 0,
      opened_at = coalesce(?, opened_at), opened_source = CASE WHEN ? IS NULL THEN opened_source ELSE 'recent' END, indexed_at = ?,
      partial_hash = CASE WHEN ? THEN NULL ELSE partial_hash END, content_id = CASE WHEN ? THEN NULL ELSE content_id END
    WHERE file_id = ?`).run(rootId, found.path, name, extension, found.size, found.modifiedAt, presence, openedAt, openedAt, indexStamp(), changed ? 1 : 0, changed ? 1 : 0, existing.file_id)
  if (changed) suspendDeletion(db, existing.file_id)
  if (changed || existing.path !== found.path || existing.presence !== presence) summary.updated++
}

/** EXT-4: lo que el usuario cargó (marca, nota, etiqueta propia) no se pierde por quedar fuera del filtro. */
function keepsUserData(db: Database, fileId: number): boolean {
  const decision = decisionOf(db, fileId)
  if (decision && (decision.action !== 'unreviewed' || decision.note)) return true
  return !!db.prepare("SELECT 1 FROM file_tag WHERE file_id = ? AND source = 'manual'").get(fileId)
}

/** M-1: un archivo marcado para eliminar que cambió no se borra; pasa a «Revisar». */
function suspendDeletion(db: Database, fileId: number): void {
  const decision = decisionOf(db, fileId)
  if (!decision || (decision.action !== 'delete' && decision.action !== 'deleteOn')) return
  writeDecision(db, fileId, { ...decision, action: 'review', due_date: today(), closed_reason: 'modified' })
}

function recordProvenance(db: Database, fileId: number, path: string): void {
  const guess = inferProvenance(path, readZoneIdentifier(path))
  db.prepare('INSERT OR REPLACE INTO provenance(file_id, origin, confidence, evidence, inference_version) VALUES (?, ?, ?, ?, ?)')
    .run(fileId, guess.origin, guess.confidence, guess.evidence, INFERENCE_VERSION)
}

/** F-5 y F-16: un archivo nuevo hereda la marca y las etiquetas de su carpeta. */
function inheritFromFolder(db: Database, fileId: number, rootId: number, folderMark: FolderMark, lastActivity: string): void {
  const decision = decisionFromFolderMark(folderMark, lastActivity, today())
  if (decision) writeDecision(db, fileId, decision)
  db.prepare("INSERT OR IGNORE INTO file_tag(file_id, tag_id, source) SELECT ?, tag_id, 'folder' FROM root_tag WHERE root_id = ?").run(fileId, rootId)
}

/** Lo que no se vio en esta pasada desapareció; M-4: su marca pendiente se cierra «ya no existe». */
function markMissing(db: Database, rootId: number, scanStartedAt: string): number {
  return transaction(db, () => {
    const gone = db.prepare("SELECT file_id FROM file WHERE root_id = ? AND presence IN ('present', 'paused') AND indexed_at < ?").all(rootId, scanStartedAt) as { file_id: number }[]
    for (const { file_id } of gone) {
      db.prepare("UPDATE file SET presence = 'missing' WHERE file_id = ?").run(file_id)
      db.prepare("UPDATE file_decision SET closed_reason = 'missing' WHERE file_id = ? AND action IN ('delete', 'deleteOn', 'review')").run(file_id)
    }
    return gone.length
  })
}

function pauseRoot(db: Database, rootId: number, volumeId: number, volumeOnline: boolean): void {
  if (!volumeOnline) db.prepare('UPDATE volume SET online = 0 WHERE volume_id = ?').run(volumeId)
  db.prepare("UPDATE file SET presence = 'paused' WHERE root_id = ? AND presence = 'present'").run(rootId)
}

/** §5.5: una carpeta que no se pudo leer se salta, se lista y se reintenta en la próxima revisión. */
function recordUnreadable(db: Database, rootId: number, path: string, error: unknown, summary: ScanSummary): void {
  summary.unreadable++
  const message = error instanceof Error ? error.message : String(error)
  db.prepare('INSERT OR REPLACE INTO root_error(root_id, path, message, seen_at) VALUES (?, ?, ?, ?)').run(rootId, path, message, nowIso())
  logError('scan.unreadable', error, path)
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
  return new RegExp(`^${escaped}$`, 'i')
}

/** Marca de la pasada en el reloj real, no en `PURGA_NOW`: separa lo visto en esta pasada de lo que no se vio. */
const indexStamp = () => new Date().toISOString()
