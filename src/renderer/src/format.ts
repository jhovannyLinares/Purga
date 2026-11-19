import type { Language } from '@shared/i18n'
import type { FileRow, MarkAction, Origin } from '@shared/model'
import type { TextKey } from '@shared/i18n'
import type { Translate } from './text'

/** Formato de cifras, fechas y textos derivados de un archivo, en el idioma activo. */

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB']
const BYTES_PER_UNIT = 1024

export function formatBytes(bytes: number, language: Language): string {
  let value = bytes
  let unit = 0
  while (value >= BYTES_PER_UNIT && unit < UNITS.length - 1) {
    value /= BYTES_PER_UNIT
    unit++
  }
  const digits = unit === 0 || value >= 100 ? 0 : 1
  return `${value.toLocaleString(language, { maximumFractionDigits: digits })} ${UNITS[unit]}`
}

export const formatCount = (count: number, language: Language) => count.toLocaleString(language)

/** `AAAA-MM-DD` → `dd/mm/aaaa`, como en la maqueta. */
export function formatDay(day: string): string {
  const [year, month, date] = day.slice(0, 10).split('-')
  return `${date}/${month}/${year}`
}

const DAY_MS = 24 * 60 * 60 * 1000

export function todayDay(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export function daysBetween(fromDay: string, toDay: string): number {
  return Math.round((Date.parse(toDay.slice(0, 10)) - Date.parse(fromDay.slice(0, 10))) / DAY_MS)
}

/** Días transcurridos desde una fecha ISO hasta hoy, en la zona del equipo; nunca negativo. */
export function daysSince(iso: string): number {
  const date = new Date(iso)
  const local = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return Math.max(0, daysBetween(local, todayDay()))
}

/** F-3: dice cuál de las dos fechas usó. */
export function activityText(t: Translate, file: Pick<FileRow, 'openedAt' | 'modifiedAt'>): string {
  if (file.openedAt) return t('file.unopenedFor', { days: daysSince(file.openedAt) })
  return t('file.unopenedModified', { days: daysSince(file.modifiedAt) })
}

/** La misma actividad en dos partes para una celda angosta: los días y de qué fecha salen. */
export function activityParts(t: Translate, file: Pick<FileRow, 'openedAt' | 'modifiedAt'>): { days: string; source: string } {
  const days = daysSince(file.openedAt ?? file.modifiedAt)
  return { days: t('file.days', { days }), source: t(file.openedAt ? 'file.sinceOpened' : 'file.sinceModified') }
}

export const MARK_LABEL: Record<MarkAction, TextKey> = {
  unreviewed: 'mark.unreviewed',
  keep: 'mark.keep',
  delete: 'mark.delete',
  deleteOn: 'mark.deleteOn',
  review: 'mark.review',
  archived: 'mark.archived'
}

export const MARK_TONE: Record<MarkAction, string> = { unreviewed: '', keep: 'ok', delete: 'err', deleteOn: 'warn', review: 'new', archived: '' }

export const ORIGIN_LABEL: Record<Origin, TextKey> = {
  browser: 'origin.browser',
  outlook: 'origin.outlook',
  whatsapp: 'origin.whatsapp',
  telegram: 'origin.telegram',
  screenshot: 'origin.screenshot',
  downloads: 'origin.downloads',
  unknown: 'origin.unknown'
}

/** Carpeta de un archivo: su ruta sin el nombre. */
export const folderOf = (file: Pick<FileRow, 'path' | 'name'>) => file.path.slice(0, file.path.length - file.name.length - 1)

/** La evidencia suele ser un enlace larguísimo: en la línea va solo su sitio (el dominio). */
export function shortEvidence(evidence: string): string {
  try {
    return new URL(evidence).host
  } catch {
    return evidence // no es un enlace («nombre y carpeta», «Zone.Identifier»): ya es corta
  }
}
