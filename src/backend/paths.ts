import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { purgaHomePath } from '@shared/preferences'

/** Carpeta de datos de Purga, creada si falta. `PURGA_HOME` la cambia (tests y perfiles de prueba). */
export function purgaHome(): string {
  const home = purgaHomePath(process.env, process.cwd())
  mkdirSync(home, { recursive: true })
  return home
}

/** Escribe primero a un temporal y después lo renombra: el archivo nunca queda a medias. */
export function writeAtomic(file: string, content: string): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file + '.tmp', content, 'utf8')
  renameSync(file + '.tmp', file)
}

export const dataFile = (name: string) => join(purgaHome(), name)
