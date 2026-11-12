import type { FolderMark, MarkAction } from '@shared/model'
import { addDays, nowIso, type Database } from './db'

/** La decisión (marca) de un archivo: una fila por archivo en `file_decision` (F-4, F-5). */

export interface Decision {
  action: MarkAction
  due_date: string | null
  expires_on: string | null
  note: string
  source: 'manual' | 'folder' | 'rule'
  batch_id: number | null
  content_hash_at_decision: string | null
  size_at_decision: number | null
  closed_reason: string | null
}

export function decisionOf(db: Database, fileId: number): Decision | null {
  return (db.prepare('SELECT * FROM file_decision WHERE file_id = ?').get(fileId) as Decision | undefined) ?? null
}

export function writeDecision(db: Database, fileId: number, decision: Decision): void {
  db.prepare(`INSERT INTO file_decision(file_id, action, due_date, expires_on, note, source, batch_id, decided_at,
      content_hash_at_decision, size_at_decision, closed_reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(file_id) DO UPDATE SET action = excluded.action, due_date = excluded.due_date, expires_on = excluded.expires_on,
      note = excluded.note, source = excluded.source, batch_id = excluded.batch_id, decided_at = excluded.decided_at,
      content_hash_at_decision = excluded.content_hash_at_decision, size_at_decision = excluded.size_at_decision,
      closed_reason = excluded.closed_reason`).run(
    fileId, decision.action, decision.due_date, decision.expires_on, decision.note, decision.source, decision.batch_id, nowIso(),
    decision.content_hash_at_decision, decision.size_at_decision, decision.closed_reason
  )
}

/** Borra la decisión salvo la nota: «Sin revisar» sin nota no necesita fila. */
export function clearDecision(db: Database, fileId: number): void {
  const current = decisionOf(db, fileId)
  if (current?.note) {
    writeDecision(db, fileId, { ...emptyDecision('manual'), note: current.note })
    return
  }
  db.prepare('DELETE FROM file_decision WHERE file_id = ?').run(fileId)
}

export function emptyDecision(source: Decision['source']): Decision {
  return { action: 'unreviewed', due_date: null, expires_on: null, note: '', source, batch_id: null, content_hash_at_decision: null, size_at_decision: null, closed_reason: null }
}

/**
 * Lo que una marca de carpeta decide para un archivo, o null si no decide nada. «Eliminar lo de más de N días» cuenta
 * desde la última actividad (apertura o modificación), igual que las reglas.
 */
export function decisionFromFolderMark(mark: FolderMark, lastActivity: string, today: string): Decision | null {
  if (mark.kind === 'keepAll') return { ...emptyDecision('folder'), action: 'keep' }
  if (mark.kind === 'reviewEvery') return { ...emptyDecision('folder'), action: 'review', due_date: addDays(today, mark.days) }
  if (mark.kind !== 'deleteOlderThan') return null
  const dueByAge = addDays(lastActivity.slice(0, 10), mark.days)
  return { ...emptyDecision('folder'), action: 'deleteOn', due_date: dueByAge > today ? dueByAge : today }
}
