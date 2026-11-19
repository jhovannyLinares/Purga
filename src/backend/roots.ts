import { existsSync, realpathSync, statSync } from 'node:fs'
import { basename, parse, resolve } from 'node:path'
import { DEFAULT_EXTENSION_FILTER, normalizeExtension } from '@shared/extensions'
import { FolderMarkSchema, type ExtensionFilter, type FolderMark, type Root } from '@shared/model'
import { getSetting, nowIso, setSetting, transaction, type Database } from './db'
import { hasRecycleBin } from './win32'

/** Volúmenes y carpetas vigiladas (F-1, F-5, F-12). */

/** El número de serie del volumen sale de `stat().dev`: distingue dos discos aunque cambien de letra. */
export function volumeFor(db: Database, path: string): number {
  const serial = String(statSync(path, { bigint: true }).dev)
  const mount = parse(resolve(path)).root
  const existing = db.prepare('SELECT volume_id FROM volume WHERE serial_number = ?').get(serial) as { volume_id: number } | undefined
  if (existing) {
    db.prepare('UPDATE volume SET mount_path = ?, online = 1 WHERE volume_id = ?').run(mount, existing.volume_id)
    return existing.volume_id
  }
  const inserted = db.prepare('INSERT INTO volume(serial_number, mount_path, has_recycle_bin) VALUES (?, ?, ?)').run(serial, mount, hasRecycleBin(mount) ? 1 : 0)
  return Number(inserted.lastInsertRowid)
}

export function addRoot(db: Database, path: string): number {
  if (!existsSync(path) || !statSync(path).isDirectory()) throw new Error(`No es una carpeta: ${path}`)
  // la ruta larga: la Papelera y el Explorador nunca usan los nombres cortos (JHOVAN~1)
  const absolute = realpathSync.native(resolve(path))
  const duplicate = db.prepare('SELECT root_id FROM watched_root WHERE lower(path) = lower(?)').get(absolute)
  if (duplicate) throw new Error(`La carpeta ya está vigilada: ${absolute}`)
  const volumeId = volumeFor(db, absolute)
  const inserted = db.prepare('INSERT INTO watched_root(volume_id, path, created_at) VALUES (?, ?, ?)').run(volumeId, absolute, nowIso())
  return Number(inserted.lastInsertRowid)
}

/** Deja de vigilar: sus archivos sin marca salen del índice; los que el usuario marcó quedan como sueltos. */
export function removeRoot(db: Database, rootId: number): void {
  transaction(db, () => {
    db.prepare(`DELETE FROM file WHERE root_id = ? AND file_id NOT IN (SELECT file_id FROM file_decision)
      AND file_id NOT IN (SELECT file_id FROM file_tag WHERE source = 'manual')`).run(rootId)
    db.prepare('UPDATE file SET loose = 1, root_id = NULL WHERE root_id = ?').run(rootId)
    db.prepare('DELETE FROM watched_root WHERE root_id = ?').run(rootId)
  })
}

interface RootRecord {
  root_id: number
  path: string
  folder_mark: string
  extension_mode: string
  exclude_globs: string
  mount_path: string
  online: number
  has_recycle_bin: number
  volume_id: number
}

export function rootRecord(db: Database, rootId: number): RootRecord {
  const row = db.prepare(`SELECT r.*, v.mount_path, v.online, v.has_recycle_bin FROM watched_root r JOIN volume v USING (volume_id) WHERE root_id = ?`).get(rootId) as RootRecord | undefined
  if (!row) throw new Error(`Carpeta vigilada inexistente: ${rootId}`)
  return row
}

export function rootIds(db: Database): number[] {
  return (db.prepare('SELECT root_id FROM watched_root ORDER BY root_id').all() as { root_id: number }[]).map((row) => row.root_id)
}

export function listRoots(db: Database): Root[] {
  const rows = db.prepare(`SELECT r.root_id, r.path, r.folder_mark, r.extension_mode, r.exclude_globs, v.online, v.has_recycle_bin,
      (SELECT count(*) FROM file f WHERE f.root_id = r.root_id AND f.presence = 'present') AS files,
      (SELECT ifnull(sum(size_bytes), 0) FROM file f WHERE f.root_id = r.root_id AND f.presence = 'present') AS bytes
    FROM watched_root r JOIN volume v USING (volume_id) ORDER BY r.path`).all() as unknown as (RootRecord & { files: number; bytes: number })[]
  return rows.map((row) => ({
    rootId: row.root_id,
    path: row.path,
    name: basename(row.path) || row.path,
    folderMark: FolderMarkSchema.parse(JSON.parse(row.folder_mark)),
    extensions: rootExtensionFilter(db, row.root_id, row.extension_mode),
    tags: rootTags(db, row.root_id),
    excludes: JSON.parse(row.exclude_globs) as string[],
    files: row.files,
    bytes: row.bytes,
    online: row.online === 1,
    hasRecycleBin: row.has_recycle_bin === 1
  }))
}

export function setFolderMark(db: Database, rootId: number, mark: FolderMark): void {
  db.prepare('UPDATE watched_root SET folder_mark = ? WHERE root_id = ?').run(JSON.stringify(mark), rootId)
}

export function setExcludes(db: Database, rootId: number, patterns: string[]): void {
  db.prepare('UPDATE watched_root SET exclude_globs = ? WHERE root_id = ?').run(JSON.stringify(patterns.map((pattern) => pattern.trim()).filter(Boolean)), rootId)
}

export function folderMarkOf(db: Database, rootId: number): FolderMark {
  return FolderMarkSchema.parse(JSON.parse(rootRecord(db, rootId).folder_mark))
}

function listedExtensions(db: Database, rootId: number | null): string[] {
  const rows = db.prepare('SELECT extension FROM extension_filter WHERE root_id IS ? ORDER BY extension').all(rootId) as { extension: string }[]
  return rows.map((row) => row.extension)
}

function rootExtensionFilter(db: Database, rootId: number, mode: string): ExtensionFilter | null {
  if (mode === 'inherit') return null
  return { mode: mode === 'allow' ? 'allow' : 'deny', extensions: listedExtensions(db, rootId) }
}

const GLOBAL_EXTENSION_MODE = 'extensions.mode'
const GLOBAL_EXTENSIONS_SEEDED = 'extensions.seeded'

export function globalExtensionFilter(db: Database): ExtensionFilter {
  if (!getSetting(db, GLOBAL_EXTENSIONS_SEEDED)) saveExtensionFilter(db, null, DEFAULT_EXTENSION_FILTER)
  const mode = getSetting(db, GLOBAL_EXTENSION_MODE) === 'allow' ? 'allow' : 'deny'
  return { mode, extensions: listedExtensions(db, null) }
}

export function rootFilterOrNull(db: Database, rootId: number): ExtensionFilter | null {
  return rootExtensionFilter(db, rootId, rootRecord(db, rootId).extension_mode)
}

/** Guarda el filtro global (`rootId` null) o el de una carpeta; `filter` null en una carpeta = hereda el global. */
export function saveExtensionFilter(db: Database, rootId: number | null, filter: ExtensionFilter | null): void {
  transaction(db, () => {
    db.prepare('DELETE FROM extension_filter WHERE root_id IS ?').run(rootId)
    if (rootId === null) {
      setSetting(db, GLOBAL_EXTENSION_MODE, filter?.mode ?? 'deny')
      setSetting(db, GLOBAL_EXTENSIONS_SEEDED, '1')
    } else {
      db.prepare('UPDATE watched_root SET extension_mode = ? WHERE root_id = ?').run(filter?.mode ?? 'inherit', rootId)
    }
    const insert = db.prepare('INSERT OR IGNORE INTO extension_filter(root_id, extension) VALUES (?, ?)')
    for (const extension of filter?.extensions ?? []) {
      const normalized = normalizeExtension(extension)
      if (normalized) insert.run(rootId, normalized)
    }
  })
}

export function rootTags(db: Database, rootId: number): string[] {
  const rows = db.prepare('SELECT t.name FROM root_tag rt JOIN tag t USING (tag_id) WHERE rt.root_id = ? ORDER BY t.name').all(rootId) as { name: string }[]
  return rows.map((row) => row.name)
}

export function rootErrors(db: Database): { path: string; message: string }[] {
  return db.prepare('SELECT path, message FROM root_error ORDER BY path').all() as { path: string; message: string }[]
}
