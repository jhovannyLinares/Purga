import { mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { openDatabase, type Database } from '../src/backend/db'

/** Arnés común de los tests de integración: índice en memoria y carpetas de prueba en %TEMP%. */
export function memoryDb(): Database {
  return openDatabase(':memory:')
}

export function tempFolder(prefix = 'purga-'): string {
  // la ruta larga, como la guarda addRoot
  return realpathSync.native(mkdtempSync(join(tmpdir(), prefix)))
}

/** Crea los archivos `{ruta relativa: contenido}` y devuelve la carpeta. */
export function tree(files: Record<string, string | Buffer>, folder = tempFolder()): string {
  for (const [relative, content] of Object.entries(files)) {
    const path = join(folder, relative)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content)
  }
  return folder
}

export function idOf(db: Database, name: string): number {
  const row = db.prepare('SELECT file_id FROM file WHERE name = ?').get(name) as { file_id: number } | undefined
  if (!row) throw new Error(`No está en el índice: ${name}`)
  return row.file_id
}

export const NO_OPENINGS = new Map<string, string>()
