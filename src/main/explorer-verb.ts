import { app } from 'electron'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

/**
 * Verbo clásico del clic derecho (F-13) en `HKCU\Software\Classes\*\shell`, sin administrador. En Windows 11 aparece
 * en «Mostrar más opciones». El desinstalador lo quita (build/installer.nsh).
 */
const VERB_KEY = 'HKCU\\Software\\Classes\\*\\shell\\Purga.Programar'
export const SCHEDULE_ARG = '--schedule'

const run = promisify(execFile)

/** Comando que abre Purga con el archivo; en desarrollo, Electron necesita además la carpeta de la app. */
function command(): string {
  const appArg = app.isPackaged ? '' : ` "${app.getAppPath()}"`
  // `--schedule="%1"` en un solo argumento: Chromium reordena los sueltos y separaría la ruta de su opción
  return `"${process.execPath}"${appArg} ${SCHEDULE_ARG}="%1"`
}

export async function registerExplorerVerb(label: string): Promise<void> {
  await run('reg.exe', ['add', VERB_KEY, '/ve', '/d', label, '/f'], { windowsHide: true })
  await run('reg.exe', ['add', VERB_KEY, '/v', 'Icon', '/d', process.execPath, '/f'], { windowsHide: true })
  await run('reg.exe', ['add', `${VERB_KEY}\\command`, '/ve', '/d', command(), '/f'], { windowsHide: true })
}

/** Rutas que trae una llamada (`--schedule=C:\…`), del primer arranque o de la segunda instancia. */
export function scheduledPaths(argv: string[]): string[] {
  const prefix = `${SCHEDULE_ARG}=`
  const paths = argv.filter((arg) => arg.startsWith(prefix)).map((arg) => arg.slice(prefix.length).replace(/^"|"$/g, '')).filter(Boolean)
  // una ruta de red (\\servidor\…) haría que Windows se autentique contra ese servidor al leerla: Purga es local
  return paths.filter((path) => !path.startsWith(NETWORK_PATH_PREFIX))
}

const NETWORK_PATH_PREFIX = '\\\\'
