import type { Summary } from '@shared/ipc-contracts'
import type { FileRow } from '@shared/model'
import { addDays, type Database } from './db'
import { duplicateGroups } from './duplicates'
import { selectRows } from './files'

/** Cifras del Resumen y de los contadores de la columna izquierda. */

const PRESENT = "f.presence = 'present'"

export function scheduledFiles(db: Database): FileRow[] {
  return selectRows(db, `${PRESENT} AND d.action IN ('deleteOn', 'review') AND d.closed_reason IS NULL`, [], 'd.due_date, f.name')
}

export function expiringFiles(db: Database, today: string): FileRow[] {
  return selectRows(db, `f.presence IN ('present', 'filtered_out') AND d.expires_on IS NOT NULL AND d.expires_on >= ?`, [today], 'd.expires_on, f.name')
}

/** Lo que vence en los próximos 60 días: el primer umbral de aviso (F-11). */
const EXPIRY_WINDOW_DAYS = 60
const NEXT_SCHEDULED = 5
/** «Más espacio sin abrir»: más de medio año sin actividad, las tres carpetas que más ocupan. */
const STALE_DAYS = 180
const STALE_FOLDERS_SHOWN = 3

function staleFolders(db: Database, today: string): Summary['staleFolders'] {
  const rows = db.prepare(`SELECT f.path, f.name, f.size_bytes FROM file f WHERE ${PRESENT} AND coalesce(f.opened_at, f.modified_at) < ?`).all(addDays(today, -STALE_DAYS)) as { path: string; name: string; size_bytes: number }[]
  const byFolder = new Map<string, number>()
  for (const row of rows) {
    const folder = row.path.slice(0, row.path.length - row.name.length - 1)
    byFolder.set(folder, (byFolder.get(folder) ?? 0) + row.size_bytes)
  }
  return [...byFolder].map(([folder, bytes]) => ({ folder, bytes })).sort((left, right) => right.bytes - left.bytes).slice(0, STALE_FOLDERS_SHOWN)
}

export function summary(db: Database, today: string): Summary {
  const totals = db.prepare(`SELECT count(*) AS files, ifnull(sum(size_bytes), 0) AS bytes FROM file f WHERE ${PRESENT}`).get() as { files: number; bytes: number }
  const proposals = db.prepare(`SELECT count(*) AS n, ifnull(sum(f.size_bytes), 0) AS bytes FROM file f
    WHERE ${PRESENT} AND f.file_id IN (SELECT file_id FROM rule_match WHERE resolution = 'pending')`).get() as { n: number; bytes: number }
  const scheduled = scheduledFiles(db).filter((row) => row.action === 'deleteOn')
  const unreviewed = db.prepare(`SELECT count(*) AS n FROM file f LEFT JOIN file_decision d USING (file_id) WHERE ${PRESENT} AND ifnull(d.action, 'unreviewed') = 'unreviewed'`).get() as { n: number }
  return {
    roots: (db.prepare('SELECT count(*) AS n FROM watched_root').get() as { n: number }).n,
    files: totals.files,
    bytes: totals.bytes,
    proposals: proposals.n,
    proposalBytes: proposals.bytes,
    scheduled: scheduled.length,
    scheduledBytes: scheduled.reduce((total, row) => total + row.sizeBytes, 0),
    duplicateGroups: duplicateGroups(db).length,
    expiring: expiringFiles(db, today).filter((row) => row.expiresOn! <= addDays(today, EXPIRY_WINDOW_DAYS)).length,
    unreviewed: unreviewed.n,
    byOrigin: db.prepare(`SELECT ifnull(p.origin, 'unknown') AS origin, sum(f.size_bytes) AS bytes FROM file f LEFT JOIN provenance p USING (file_id)
      WHERE ${PRESENT} GROUP BY 1 ORDER BY 2 DESC`).all() as { origin: string; bytes: number }[],
    staleFolders: staleFolders(db, today),
    nextScheduled: scheduled.slice(0, NEXT_SCHEDULED)
  }
}
