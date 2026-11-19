import { existsSync, statSync } from 'node:fs'
import { EXPIRY_THRESHOLDS, NoticeSchema, type Notice, type PendingNotice } from '@shared/notices'
import { FolderMarkSchema } from '@shared/model'
import { addDays, getSetting, nowIso, setSetting, transaction, type Database } from './db'
import { decisionOf, writeDecision } from './decisions'
import { hashContents } from './duplicates'
import { partialHash } from './hashing'
import { logError, logInfo } from './log'
import { currentPath, trashFiles } from './marks'
import { analyzePhotos, organizePhotos } from './photos'
import { evaluateRules, recordMatch } from './rules'

/** Pasada diaria (§5.2) y ejecución de lo programado (§5.3). */

const LAST_PASS_KEY = 'dailyPass.last'
const DAY_MS = 24 * 60 * 60 * 1000

export function dailyPassDue(db: Database, now: string): boolean {
  const last = getSetting(db, LAST_PASS_KEY)
  return !last || Date.parse(now) - Date.parse(last) >= DAY_MS
}

export interface DailyPassSummary {
  proposals: number
  executed: number
  notices: number
  photosMoved: number
}

export async function runDailyPass(db: Database, today: string): Promise<DailyPassSummary> {
  await hashContents(db)
  await analyzePhotos(db)
  const proposals = evaluateRules(db, today)
  let notices = queueExpiryNotices(db, today)
  notices += queueCountNotice(db, 'dueTomorrow', `dueTomorrow:${addDays(today, 1)}`,
    "SELECT count(*) AS n FROM file_decision d JOIN file f USING (file_id) WHERE d.action = 'deleteOn' AND d.due_date = ? AND d.closed_reason IS NULL AND f.presence = 'present'", addDays(today, 1))
  notices += queueCountNotice(db, 'reviewToday', `reviewToday:${today}`,
    "SELECT count(*) AS n FROM file_decision d JOIN file f USING (file_id) WHERE d.action = 'review' AND d.due_date <= ? AND f.presence = 'present'", today)
  const executed = await executeScheduled(db, today)
  const photosMoved = await sortPhotoFolders(db, today)
  setSetting(db, LAST_PASS_KEY, nowIso())
  logInfo('dailyPass.done', `propuestas ${proposals}, ejecutados ${executed}, fotos ${photosMoved}`)
  return { proposals, executed, notices, photosMoved }
}

function queue(db: Database, notice: Notice, dedupeKey: string, delivered = false): number {
  const result = db.prepare('INSERT OR IGNORE INTO event_outbox(type, payload, dedupe_key, created_at, delivered_at) VALUES (?, ?, ?, ?, ?)')
    .run(notice.kind, JSON.stringify(notice), dedupeKey, nowIso(), delivered ? nowIso() : null)
  return Number(result.changes)
}

function queueCountNotice(db: Database, kind: 'dueTomorrow' | 'reviewToday', dedupeKey: string, sql: string, day: string): number {
  const count = (db.prepare(sql).get(day) as { n: number }).n
  return count > 0 ? queue(db, { kind, count }, dedupeKey) : 0
}

/**
 * F-11: 60 · 30 · 7 · 1 días antes, una vez cada uno. Si la app estuvo cerrada y se saltó umbrales, avisa solo el más
 * cercano y da por avisados los anteriores.
 */
function queueExpiryNotices(db: Database, today: string): number {
  const expiring = db.prepare(`SELECT d.file_id, d.expires_on, f.name FROM file_decision d JOIN file f USING (file_id)
    WHERE d.expires_on IS NOT NULL AND d.expires_on >= ? AND d.expires_on <= ?`).all(today, addDays(today, EXPIRY_THRESHOLDS[0])) as { file_id: number; expires_on: string; name: string }[]
  let queued = 0
  for (const file of expiring) {
    const daysLeft = Math.round((Date.parse(file.expires_on) - Date.parse(today)) / DAY_MS)
    const crossed = EXPIRY_THRESHOLDS.filter((threshold) => daysLeft <= threshold)
    const closest = crossed[crossed.length - 1]
    for (const threshold of crossed) {
      const notice: Notice = { kind: 'expiry', name: file.name, days: daysLeft, expiresOn: file.expires_on }
      queued += queue(db, notice, `${file.file_id}:expiry:${file.expires_on}:${threshold}`, threshold !== closest)
    }
  }
  return queued
}

interface DueFile {
  file_id: number
  path: string
  name: string
  fs_file_ref: string
  mount_path: string
  has_recycle_bin: number
  online: number
  size_bytes: number
  modified_at: string
}

/** §5.3: verificar identidad y Papelera antes de cada eliminación programada; lo verificado va a un lote del día. */
export async function executeScheduled(db: Database, today: string): Promise<number> {
  const due = db.prepare(`SELECT f.file_id, f.path, f.name, f.fs_file_ref, f.size_bytes, f.modified_at, v.mount_path, v.has_recycle_bin, v.online
    FROM file_decision d JOIN file f USING (file_id) JOIN volume v USING (volume_id)
    WHERE d.action = 'deleteOn' AND d.due_date <= ? AND d.closed_reason IS NULL`).all(today) as unknown as DueFile[]
  const verified: number[] = []
  let offline = 0
  let unconfirmed = 0
  for (const file of due) {
    if (!existsSync(file.mount_path)) {
      offline++ // M-5: el disco no está; espera a que vuelva
      continue
    }
    const path = currentPath(file)
    const decision = decisionOf(db, file.file_id)!
    if (!path) {
      writeDecision(db, file.file_id, { ...decision, closed_reason: 'missing' }) // M-4
      continue
    }
    if (!(await sameAsDecided(path, decision.size_at_decision, decision.content_hash_at_decision))) {
      writeDecision(db, file.file_id, { ...decision, action: 'review', due_date: today, closed_reason: 'modified' }) // M-1
      continue
    }
    if (file.has_recycle_bin === 0) {
      // F-19: sin Papelera no se ejecuta solo; pasa a Propuestas con el aviso
      recordMatch(db, 'F-19', { fileId: file.file_id, sizeBytes: file.size_bytes, modifiedAt: file.modified_at, detail: decision.due_date })
      writeDecision(db, file.file_id, { ...decision, closed_reason: 'needsConfirmation' })
      unconfirmed++
      continue
    }
    verified.push(file.file_id)
  }
  if (offline) queue(db, { kind: 'volumeOffline', count: offline }, `volumeOffline:${today}`)
  if (unconfirmed) queue(db, { kind: 'needsConfirmation', count: unconfirmed }, `needsConfirmation:${today}`)
  if (verified.length === 0) return 0
  const result = await trashFiles(db, verified, `Eliminaciones programadas del ${today}`, null)
  queue(db, { kind: 'executed', trashed: result.trashed, failed: result.failed.length }, `executed:${today}:${result.batchId}`)
  return result.trashed
}

async function sameAsDecided(path: string, size: number | null, hash: string | null): Promise<boolean> {
  try {
    if (size !== null && statSync(path).size !== size) return false
    return hash === null || (await partialHash(path)) === hash
  } catch (error) {
    logError('scheduled.verify', error, path)
    return false
  }
}

/** Carpetas con la marca «Ordenar fotos por fecha»: solo mueve, y las de fecha dudosa se proponen (F-10). */
async function sortPhotoFolders(db: Database, today: string): Promise<number> {
  const roots = db.prepare('SELECT root_id, folder_mark FROM watched_root').all() as { root_id: number; folder_mark: string }[]
  let moved = 0
  for (const root of roots) {
    const mark = FolderMarkSchema.parse(JSON.parse(root.folder_mark))
    if (mark.kind !== 'photosByDate') continue
    const photos = db.prepare(`SELECT p.file_id, p.date_source, f.size_bytes, f.modified_at FROM photo p JOIN file f USING (file_id) WHERE f.root_id = ? AND f.presence = 'present'`).all(root.root_id) as { file_id: number; date_source: string; size_bytes: number; modified_at: string }[]
    if (photos.length === 0) continue
    const result = await organizePhotos(db, { fileIds: photos.map((photo) => photo.file_id), destination: mark.destination, granularity: 'day', mode: 'move' }, `Fotos por fecha del ${today}`, true)
    for (const photo of photos.filter((candidate) => candidate.date_source === 'modified')) {
      recordMatch(db, 'F-10', { fileId: photo.file_id, sizeBytes: photo.size_bytes, modifiedAt: photo.modified_at, detail: mark.destination })
    }
    moved += result.done
  }
  if (moved) queue(db, { kind: 'photosMoved', count: moved }, `photosMoved:${today}`)
  return moved
}

export function pendingNotices(db: Database): PendingNotice[] {
  const rows = db.prepare('SELECT event_id, payload FROM event_outbox WHERE delivered_at IS NULL ORDER BY event_id').all() as { event_id: number; payload: string }[]
  return rows.map((row) => ({ eventId: row.event_id, notice: NoticeSchema.parse(JSON.parse(row.payload)) }))
}

export function ackNotices(db: Database, eventIds: number[]): void {
  const ack = db.prepare('UPDATE event_outbox SET delivered_at = ? WHERE event_id = ?')
  transaction(db, () => eventIds.forEach((eventId) => ack.run(nowIso(), eventId)))
}
