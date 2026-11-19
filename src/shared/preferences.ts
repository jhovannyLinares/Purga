import { z } from 'zod'

/** Preferencias del usuario. Viven en %APPDATA%\Purga\preferences.json para que la pantalla de carga también las lea. */
export const PreferencesSchema = z.object({
  language: z.enum(['system', 'es', 'en']),
  theme: z.enum(['system', 'light', 'dark']),
  /** al cerrar la ventana, Purga queda en la bandeja para la pasada diaria y los avisos */
  keepInTray: z.boolean(),
  startWithWindows: z.boolean(),
  /**
   * Columnas y anchos elegidos por tabla (shared/table-columns.ts). Cada tabla se valida al leerla: una rota vuelve a
   * lo de fábrica sin arrastrar al resto de las preferencias; un archivo de una versión anterior no la trae.
   */
  tableLayouts: z.record(z.string(), z.unknown()).catch({}).default({})
})
export type Preferences = z.infer<typeof PreferencesSchema>

export const DEFAULT_PREFERENCES: Preferences = { language: 'system', theme: 'system', keepInTray: true, startWithWindows: false, tableLayouts: {} }

export const PREFERENCES_FILE = 'preferences.json'

/** Carpeta de datos: `PURGA_HOME` la cambia (tests y perfiles de prueba); si no, %APPDATA%\Purga. */
export function purgaHomePath(env: Record<string, string | undefined>, fallbackRoot: string): string {
  if (env.PURGA_HOME) return env.PURGA_HOME
  const appData = env.APPDATA ?? fallbackRoot
  return `${appData}\\Purga`
}
