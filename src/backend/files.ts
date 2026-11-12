import type { FileRow, MarkAction, Origin, Presence } from '@shared/model'
import type { Database } from './db'

/** Lectura de archivos del índice como filas para la interfaz. Todas las vistas pasan por `selectRows`. */

const ROW_SELECT = `SELECT f.file_id, f.root_id, f.path, f.name, f.extension, f.size_bytes, f.modified_at, f.opened_at, f.presence, f.loose,
    ifnull(p.origin, 'unknown') AS origin, ifnull(p.confidence, 0) AS confidence, p.evidence,
    ifnull(d.action, 'unreviewed') AS action, d.source AS mark_source, d.due_date, d.expires_on, ifnull(d.note, '') AS note, d.closed_reason,
    v.has_recycle_bin
  FROM file f
  JOIN volume v ON v.volume_id = f.volume_id
  LEFT JOIN provenance p ON p.file_id = f.file_id
  LEFT JOIN file_decision d ON d.file_id = f.file_id`

interface RowRecord {
  file_id: number
  root_id: number | null
  path: string
  name: string
  extension: string
  size_bytes: number
  modified_at: string
  opened_at: string | null
  presence: Presence
  loose: number
  origin: Origin
  confidence: number
  evidence: string | null
  action: MarkAction
  mark_source: FileRow['markSource']
  due_date: string | null
  expires_on: string | null
  note: string
  closed_reason: string | null
  has_recycle_bin: number
}

/** `where` y `order` los arman las vistas con parámetros; nunca llevan texto del usuario sin `?`. */
export function selectRows(db: Database, where: string, params: (string | number | null)[], order = 'f.name COLLATE NOCASE', limit = 1000): FileRow[] {
  const records = db.prepare(`${ROW_SELECT} WHERE ${where} ORDER BY ${order} LIMIT ${limit}`).all(...params) as unknown as RowRecord[]
  const tags = tagsByFile(db, records.map((record) => record.file_id))
  return records.map((record) => ({
    fileId: record.file_id,
    rootId: record.root_id,
    path: record.path,
    name: record.name,
    extension: record.extension,
    sizeBytes: record.size_bytes,
    modifiedAt: record.modified_at,
    openedAt: record.opened_at,
    presence: record.presence,
    loose: record.loose === 1,
    origin: record.origin,
    originConfidence: record.confidence,
    originEvidence: record.evidence,
    action: record.action,
    markSource: record.mark_source,
    dueDate: record.due_date,
    expiresOn: record.expires_on,
    note: record.note,
    closedReason: record.closed_reason,
    tags: tags.get(record.file_id) ?? [],
    hasRecycleBin: record.has_recycle_bin === 1
  }))
}

function tagsByFile(db: Database, fileIds: number[]): Map<number, FileRow['tags']> {
  const byFile = new Map<number, FileRow['tags']>()
  if (fileIds.length === 0) return byFile
  const rows = db.prepare(`SELECT ft.file_id, t.name, ft.source FROM file_tag ft JOIN tag t USING (tag_id)
    WHERE ft.file_id IN (SELECT value FROM json_each(?)) ORDER BY t.name`).all(JSON.stringify(fileIds)) as { file_id: number; name: string; source: FileRow['tags'][number]['source'] }[]
  for (const row of rows) {
    const list = byFile.get(row.file_id) ?? []
    list.push({ name: row.name, source: row.source })
    byFile.set(row.file_id, list)
  }
  return byFile
}

export function fileRow(db: Database, fileId: number): FileRow {
  const row = selectRows(db, 'f.file_id = ?', [fileId])[0]
  if (!row) throw new Error(`Archivo inexistente en el índice: ${fileId}`)
  return row
}

export function filesOfRoot(db: Database, rootId: number): FileRow[] {
  return selectRows(db, "f.root_id = ? AND f.presence IN ('present', 'filtered_out', 'paused')", [rootId])
}

/** Mismo criterio de «actividad» en toda la app (F-3): la apertura si se conoce; si no, la modificación. */
export const LAST_ACTIVITY_SQL = 'coalesce(f.opened_at, f.modified_at)'
