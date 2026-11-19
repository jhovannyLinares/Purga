import { statSync } from 'node:fs'
import { basename } from 'node:path'
import { extensionOf } from '@shared/extensions'
import { nowIso, type Database } from './db'
import { inferProvenance, INFERENCE_VERSION, readZoneIdentifier } from './provenance'
import { volumeFor } from './roots'

/**
 * Archivos sueltos (F-13): lo marcado desde el clic derecho entra al índice aunque su carpeta no esté vigilada, y se
 * sigue por volumen + File ID como cualquier otro.
 */
export function ensureIndexed(db: Database, path: string): number {
  const info = statSync(path, { bigint: true })
  if (!info.isFile()) throw new Error(`No es un archivo: ${path}`)
  const volumeId = volumeFor(db, path)
  const ref = String(info.ino)
  const existing = db.prepare('SELECT file_id FROM file WHERE volume_id = ? AND fs_file_ref = ?').get(volumeId, ref) as { file_id: number } | undefined
  if (existing) return existing.file_id
  const name = basename(path)
  const inserted = db.prepare(`INSERT INTO file(volume_id, fs_file_ref, path, name, extension, size_bytes, modified_at, loose, indexed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`).run(volumeId, ref, path, name, extensionOf(name), Number(info.size), new Date(Number(info.mtimeMs)).toISOString(), nowIso())
  const fileId = Number(inserted.lastInsertRowid)
  const guess = inferProvenance(path, readZoneIdentifier(path))
  db.prepare('INSERT INTO provenance(file_id, origin, confidence, evidence, inference_version) VALUES (?, ?, ?, ?, ?)').run(fileId, guess.origin, guess.confidence, guess.evidence, INFERENCE_VERSION)
  return fileId
}
