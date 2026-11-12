import { app, nativeTheme } from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveLanguage, translate } from '@shared/i18n'
import { DEFAULT_PREFERENCES, PREFERENCES_FILE, PreferencesSchema, purgaHomePath, type Preferences } from '@shared/preferences'
import type { SplashTheme } from './splash'

/**
 * Lo que main necesita antes de que exista el backend: idioma y tema para la pantalla de carga. Lee el mismo
 * preferences.json que guarda el backend; si no se puede leer, usa las de fábrica (el backend lo registra al cargarlo).
 */
export function readStartupPreferences(): Preferences {
  const file = join(purgaHomePath(process.env, app.getPath('appData')), PREFERENCES_FILE)
  if (!existsSync(file)) return DEFAULT_PREFERENCES
  try {
    return PreferencesSchema.parse(JSON.parse(readFileSync(file, 'utf8')))
  } catch {
    // no se registra aquí: el backend lee el mismo archivo al arrancar y deja el error en el registro
    return DEFAULT_PREFERENCES
  }
}

export function startupTheme(preferences: Preferences): SplashTheme {
  if (preferences.theme !== 'system') return preferences.theme
  return nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
}

export function startupLoadingText(preferences: Preferences): string {
  return translate(resolveLanguage(preferences.language, app.getLocale()), 'splash.loading')
}
