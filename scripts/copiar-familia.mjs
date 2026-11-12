// Copia la hoja de la familia (skill maqueta-app) a la app. La fuente es el skill: aquí no se edita.
// Uso: npm run familia
import { copyFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const source = join(homedir(), '.claude', 'skills', 'maqueta-app', 'familia', 'familia.css')
const target = join(here, '..', 'src', 'renderer', 'src', 'familia.css')
copyFileSync(source, target)
console.log(`familia.css copiada desde ${source}`)
