import { normalizeExtension } from '@shared/extensions'
import { SearchFiltersSchema, type SavedSearch, type SearchFilters } from '@shared/filters'
import type { FileRow } from '@shared/model'
import { addDays, type Database } from './db'
import { selectRows } from './files'

/** Búsqueda combinada (F-17). Los días se filtran por fecha (`opened_at < hoy − N`) para que use los índices. */

type Param = string | number | null

const SEARCH_LIMIT = 2000

/** Cada palabra como prefijo, entre comillas: el texto del usuario nunca se interpreta como sintaxis de FTS5. */
function ftsQuery(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => `"${word.replace(/"/g, '""')}"*`)
    .join(' ')
}

export function buildSearch(filters: SearchFilters, today: string): { where: string; params: Param[] } {
  const clauses: string[] = ["f.presence IN ('present', 'filtered_out')"]
  const params: Param[] = []
  const inList = (column: string, values: (string | number)[]) => {
    clauses.push(`${column} IN (SELECT value FROM json_each(?))`)
    params.push(JSON.stringify(values))
  }
  const text = filters.text.trim()
  if (text) {
    clauses.push(`(f.file_id IN (SELECT rowid FROM file_fts WHERE file_fts MATCH ?) OR f.file_id IN
      (SELECT ft.file_id FROM file_tag ft JOIN tag t USING (tag_id) WHERE t.name LIKE ?))`)
    params.push(ftsQuery(text), `%${text.replace(/^#/, '')}%`)
  }
  if (filters.origins.length) inList("ifnull(p.origin, 'unknown')", filters.origins)
  if (filters.minDaysUnopened) {
    clauses.push('coalesce(f.opened_at, f.modified_at) < ?')
    params.push(addDays(today, -filters.minDaysUnopened))
  }
  if (filters.minDaysUnmodified) {
    clauses.push('f.modified_at < ?')
    params.push(addDays(today, -filters.minDaysUnmodified))
  }
  if (filters.actions.length) inList("ifnull(d.action, 'unreviewed')", filters.actions)
  if (filters.tags.length) {
    const required = filters.tagMode === 'all' ? filters.tags.length : 1
    clauses.push(`(SELECT count(DISTINCT t.name) FROM file_tag ft JOIN tag t USING (tag_id) WHERE ft.file_id = f.file_id AND t.name IN (SELECT value FROM json_each(?))) >= ?`)
    params.push(JSON.stringify(filters.tags), required)
  }
  if (filters.minSizeBytes !== null) {
    clauses.push('f.size_bytes >= ?')
    params.push(filters.minSizeBytes)
  }
  if (filters.maxSizeBytes !== null) {
    clauses.push('f.size_bytes <= ?')
    params.push(filters.maxSizeBytes)
  }
  if (filters.rootIds.length) inList('f.root_id', filters.rootIds)
  if (filters.extensions.length) inList('f.extension', filters.extensions.map(normalizeExtension))
  return { where: clauses.join(' AND '), params }
}

export function searchFiles(db: Database, filters: SearchFilters, today: string): FileRow[] {
  const { where, params } = buildSearch(filters, today)
  return selectRows(db, where, params, 'f.name COLLATE NOCASE', SEARCH_LIMIT)
}

export function listSavedSearches(db: Database): SavedSearch[] {
  const rows = db.prepare('SELECT search_id, name, filters FROM saved_search WHERE pinned = 1 ORDER BY name').all() as { search_id: number; name: string; filters: string }[]
  return rows.map((row) => ({ searchId: row.search_id, name: row.name, filters: SearchFiltersSchema.parse(JSON.parse(row.filters)) }))
}

export function saveSearch(db: Database, name: string, filters: SearchFilters): number {
  return Number(db.prepare('INSERT INTO saved_search(name, filters) VALUES (?, ?)').run(name.trim(), JSON.stringify(filters)).lastInsertRowid)
}

export function deleteSavedSearch(db: Database, searchId: number): void {
  db.prepare('DELETE FROM saved_search WHERE search_id = ?').run(searchId)
}
