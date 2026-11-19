import { existsSync, readFileSync } from 'node:fs'
import { DEFAULT_PREFERENCES, PREFERENCES_FILE, PreferencesSchema, type Preferences } from '@shared/preferences'
import { readLayout } from '@shared/table-columns'
import { logError, logWarn } from './log'
import { dataFile, writeAtomic } from './paths'

/** Lee las preferencias; un archivo ilegible se registra y se usan las de fábrica, sin pisarlo. */
export function loadPreferences(): Preferences {
  const file = dataFile(PREFERENCES_FILE)
  if (!existsSync(file)) return DEFAULT_PREFERENCES
  try {
    const preferences = PreferencesSchema.parse(JSON.parse(readFileSync(file, 'utf8')))
    warnBrokenLayouts(preferences)
    return preferences
  } catch (error) {
    logError('prefs.load', error, file)
    return DEFAULT_PREFERENCES
  }
}

/** Una tabla cuya elección de columnas no se lee vuelve a lo de fábrica en la interfaz; aquí queda el aviso. */
function warnBrokenLayouts(preferences: Preferences): void {
  for (const [tableId, raw] of Object.entries(preferences.tableLayouts)) {
    if (readLayout(raw).broken) logWarn('prefs.tableLayout', 'elección de columnas ilegible: la tabla vuelve a lo de fábrica', tableId)
  }
}

export function savePreferences(preferences: Preferences): void {
  writeAtomic(dataFile(PREFERENCES_FILE), JSON.stringify(preferences, null, 2))
}
