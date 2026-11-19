import type { Database } from './db'

/** Etiquetas libres por archivo y por carpeta (F-16). `source` distingue las manuales de las de carpeta y de regla. */

function tagId(db: Database, name: string): number {
  const clean = name.trim().replace(/^#/, '')
  if (!clean) throw new Error('La etiqueta está vacía.')
  db.prepare('INSERT INTO tag(name) VALUES (?) ON CONFLICT(name) DO NOTHING').run(clean)
  return (db.prepare('SELECT tag_id FROM tag WHERE name = ?').get(clean) as { tag_id: number }).tag_id
}

/** Una etiqueta manual gana sobre la de regla o carpeta del mismo nombre. */
export function addTags(db: Database, fileIds: number[], names: string[], source: 'manual' | 'folder' | 'rule' = 'manual'): void {
  const insert = db.prepare(`INSERT INTO file_tag(file_id, tag_id, source) VALUES (?, ?, ?)
    ON CONFLICT(file_id, tag_id) DO UPDATE SET source = CASE WHEN excluded.source = 'manual' THEN 'manual' ELSE file_tag.source END`)
  for (const name of names) {
    const id = tagId(db, name)
    for (const fileId of fileIds) insert.run(fileId, id, source)
  }
}

export function removeTag(db: Database, fileIds: number[], name: string): void {
  const remove = db.prepare('DELETE FROM file_tag WHERE file_id = ? AND tag_id = (SELECT tag_id FROM tag WHERE name = ?)')
  for (const fileId of fileIds) remove.run(fileId, name)
}

export function listTags(db: Database): { name: string; files: number }[] {
  return db.prepare('SELECT t.name, count(ft.file_id) AS files FROM tag t LEFT JOIN file_tag ft USING (tag_id) GROUP BY t.tag_id ORDER BY t.name').all() as { name: string; files: number }[]
}

/** Las etiquetas de una carpeta las heredan sus archivos nuevos (las ponen las próximas revisiones). */
export function setRootTags(db: Database, rootId: number, names: string[]): void {
  db.prepare('DELETE FROM root_tag WHERE root_id = ?').run(rootId)
  for (const name of names) db.prepare('INSERT OR IGNORE INTO root_tag(root_id, tag_id) VALUES (?, ?)').run(rootId, tagId(db, name))
}
