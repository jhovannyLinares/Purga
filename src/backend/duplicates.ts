import type { FileRow } from '@shared/model'
import type { Database } from './db'
import { selectRows } from './files'
import { fullHash, partialHash } from './hashing'
import { logError } from './log'

/**
 * Duplicados exactos (F-8): por tamaño › huella parcial › huella completa. Solo se leen los archivos que comparten
 * tamaño con otro, y la huella completa solo de los que además comparten la parcial.
 */
export async function hashContents(db: Database): Promise<number> {
  const sameSize = db.prepare(`SELECT file_id, path, size_bytes FROM file WHERE presence = 'present' AND size_bytes > 0 AND size_bytes IN
      (SELECT size_bytes FROM file WHERE presence = 'present' AND size_bytes > 0 GROUP BY size_bytes HAVING count(*) > 1)
    AND partial_hash IS NULL`).all() as { file_id: number; path: string; size_bytes: number }[]
  for (const file of sameSize) {
    try {
      db.prepare('UPDATE file SET partial_hash = ? WHERE file_id = ?').run(await partialHash(file.path), file.file_id)
    } catch (error) {
      // archivo en uso o que desapareció: se reintenta en la próxima pasada (§5.5)
      logError('hash.partial', error, `archivo ${file.file_id}`)
    }
  }
  const candidates = db.prepare(`SELECT file_id, path, size_bytes FROM file WHERE presence = 'present' AND content_id IS NULL AND partial_hash IN
      (SELECT partial_hash FROM file WHERE presence = 'present' AND partial_hash IS NOT NULL GROUP BY size_bytes, partial_hash HAVING count(*) > 1)`).all() as { file_id: number; path: string; size_bytes: number }[]
  let hashed = 0
  for (const file of candidates) {
    try {
      const hash = await fullHash(file.path)
      db.prepare('INSERT INTO content(size_bytes, full_hash) VALUES (?, ?) ON CONFLICT(full_hash) DO NOTHING').run(file.size_bytes, hash)
      const content = db.prepare('SELECT content_id FROM content WHERE full_hash = ?').get(hash) as { content_id: number }
      db.prepare('UPDATE file SET content_id = ? WHERE file_id = ?').run(content.content_id, file.file_id)
      hashed++
    } catch (error) {
      logError('hash.full', error, `archivo ${file.file_id}`)
    }
  }
  return hashed
}

export interface DuplicateGroup {
  contentId: number
  sizeBytes: number
  keepFileId: number
  files: FileRow[]
}

const TRANSIENT_FOLDERS = ['\\downloads\\', '\\descargas\\', '\\temp\\', '\\tmp\\']

/** Se conserva la copia de ruta «canónica» (fuera de Descargas y temporales); entre iguales, la más antigua. */
export function canonicalCopy(files: Pick<FileRow, 'fileId' | 'path' | 'modifiedAt'>[]): number {
  const isTransient = (path: string) => TRANSIENT_FOLDERS.some((folder) => path.toLowerCase().includes(folder))
  const ranked = [...files].sort((left, right) => {
    const byFolder = Number(isTransient(left.path)) - Number(isTransient(right.path))
    return byFolder !== 0 ? byFolder : left.modifiedAt.localeCompare(right.modifiedAt)
  })
  return ranked[0]!.fileId
}

/**
 * Los «~$…» son archivos de bloqueo de Office: guardan solo el nombre de quien abrió la hoja, así que los de hojas
 * distintas tienen el mismo contenido sin ser copias de nada. Ya los propone «Archivos temporales» (BD-6).
 */
const NOT_OFFICE_LOCK = "name NOT LIKE '~$%'"

export function duplicateGroups(db: Database): DuplicateGroup[] {
  const contents = db.prepare(`SELECT content_id, size_bytes FROM content WHERE content_id IN
      (SELECT content_id FROM file WHERE presence = 'present' AND content_id IS NOT NULL AND ${NOT_OFFICE_LOCK} GROUP BY content_id HAVING count(*) > 1)
    ORDER BY size_bytes DESC`).all() as { content_id: number; size_bytes: number }[]
  return contents.map((content) => {
    const files = selectRows(db, `f.content_id = ? AND f.presence = 'present' AND f.${NOT_OFFICE_LOCK}`, [content.content_id], 'f.modified_at')
    return { contentId: content.content_id, sizeBytes: content.size_bytes, keepFileId: canonicalCopy(files), files }
  })
}
