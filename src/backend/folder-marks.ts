import type { FolderMark } from '@shared/model'
import type { Simulation } from '@shared/rules'
import { today, transaction, type Database } from './db'
import { decisionFromFolderMark, writeDecision } from './decisions'
import { setFolderMark } from './roots'

/**
 * Marca de carpeta sobre los archivos que ya están (F-5). La marca puesta a mano en un archivo gana: solo se tocan los
 * archivos sin decisión o con una decisión que vino de la carpeta.
 */
interface Affected {
  file_id: number
  size_bytes: number
  last_activity: string
  note: string | null
}

function affectedFiles(db: Database, rootId: number): Affected[] {
  return db.prepare(`SELECT f.file_id, f.size_bytes, coalesce(f.opened_at, f.modified_at) AS last_activity, d.note
    FROM file f LEFT JOIN file_decision d USING (file_id)
    WHERE f.root_id = ? AND f.presence = 'present' AND (d.file_id IS NULL OR d.source = 'folder')`).all(rootId) as unknown as Affected[]
}

/** «Programaría 1.240 archivos (6,1 GB)»: cuántos quedarían para eliminar con esta marca. */
export function simulateFolderMark(db: Database, rootId: number, mark: FolderMark): Simulation {
  if (mark.kind === 'photosByDate') return simulatePhotoSorting(db, rootId)
  const day = today()
  const scheduled = affectedFiles(db, rootId).filter((file) => decisionFromFolderMark(mark, file.last_activity, day)?.action === 'deleteOn')
  return { files: scheduled.length, bytes: scheduled.reduce((total, file) => total + file.size_bytes, 0) }
}

/** «Ordenar fotos por fecha»: cuántas fotos movería hoy; las de fecha dudosa no cuentan, se proponen (F-10). */
function simulatePhotoSorting(db: Database, rootId: number): Simulation {
  const row = db.prepare(`SELECT count(*) AS files, ifnull(sum(f.size_bytes), 0) AS bytes FROM photo p JOIN file f USING (file_id)
    WHERE f.root_id = ? AND f.presence = 'present' AND p.date_source <> 'modified'`).get(rootId) as { files: number; bytes: number }
  return { files: row.files, bytes: row.bytes }
}

export function applyFolderMark(db: Database, rootId: number, mark: FolderMark): void {
  const day = today()
  transaction(db, () => {
    setFolderMark(db, rootId, mark)
    for (const file of affectedFiles(db, rootId)) {
      const decision = decisionFromFolderMark(mark, file.last_activity, day)
      if (decision) writeDecision(db, file.file_id, { ...decision, note: file.note ?? '' })
      else if (file.note) writeDecision(db, file.file_id, { action: 'unreviewed', due_date: null, expires_on: null, note: file.note, source: 'manual', batch_id: null, content_hash_at_decision: null, size_at_decision: null, closed_reason: null })
      else db.prepare('DELETE FROM file_decision WHERE file_id = ?').run(file.file_id)
    }
  })
}
