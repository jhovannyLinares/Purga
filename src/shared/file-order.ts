import type { FileRow } from './model'

/** Orden de la tabla de archivos y tono de su barra de actividad. Sin DOM ni idioma: lo prueba un test unitario. */

/** Hasta aquí un archivo está en uso. */
export const ACTIVE_DAYS = 30
/** Desde aquí está dormido; el mismo corte que «Más espacio sin abrir» del Resumen. */
export const DORMANT_DAYS = 180
/** La barra se llena al año sin actividad; más allá queda llena. */
export const BAR_FULL_DAYS = 365
/** Un archivo recién abierto conserva un trazo visible. */
export const BAR_MIN_PERCENT = 6

export type ActivityTone = 'ok' | 'warn' | 'err'

export function activityTone(idleDays: number): ActivityTone {
  if (idleDays <= ACTIVE_DAYS) return 'ok'
  if (idleDays <= DORMANT_DAYS) return 'warn'
  return 'err'
}

export function activityPercent(idleDays: number): number {
  const filled = (Math.min(idleDays, BAR_FULL_DAYS) / BAR_FULL_DAYS) * 100
  return Math.max(BAR_MIN_PERCENT, filled)
}

export type SortKey = 'name' | 'origin' | 'activity' | 'size' | 'mark'
export type SortDirection = 'asc' | 'desc'
export interface FileSort {
  key: SortKey
  direction: SortDirection
}

/** Sentido del primer clic: el que suele buscarse (lo más inactivo, lo más grande). */
const FIRST_DIRECTION: Record<SortKey, SortDirection> = { name: 'asc', origin: 'asc', activity: 'desc', size: 'desc', mark: 'asc' }

export function nextSort(current: FileSort | null, key: SortKey): FileSort {
  if (current?.key !== key) return { key, direction: FIRST_DIRECTION[key] }
  return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
}

/** Lo que se compara por columna; origen y marca llegan ya traducidos para ordenar por lo que se lee. */
export interface SortValues {
  idleDays: (file: FileRow) => number
  originLabel: (file: FileRow) => string
  markLabel: (file: FileRow) => string
}

export function sortFiles(files: FileRow[], sort: FileSort | null, values: SortValues, locale: string): FileRow[] {
  if (!sort) return files
  const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true })
  const compareByKey: Record<SortKey, (left: FileRow, right: FileRow) => number> = {
    name: (left, right) => collator.compare(left.name, right.name),
    origin: (left, right) => collator.compare(values.originLabel(left), values.originLabel(right)),
    activity: (left, right) => values.idleDays(left) - values.idleDays(right),
    size: (left, right) => left.sizeBytes - right.sizeBytes,
    mark: (left, right) => collator.compare(values.markLabel(left), values.markLabel(right))
  }
  const sign = sort.direction === 'asc' ? 1 : -1
  return [...files].sort((left, right) => compareByKey[sort.key](left, right) * sign)
}
