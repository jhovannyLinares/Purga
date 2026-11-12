import type { ExtensionFilter } from './model'

/** Reglas de extensiones (spec §4.3). */

/** EXT-2: minúscula y sin punto. */
export function normalizeExtension(extension: string): string {
  return extension.trim().toLowerCase().replace(/^\.+/, '')
}

/** EXT-3: la extensión doble (`tar.gz`) cuenta solo si está declarada en el filtro; si no, la última. */
export function extensionOf(name: string, declared: readonly string[] = []): string {
  const lower = name.toLowerCase()
  const double = declared.find((extension) => extension.includes('.') && lower.endsWith(`.${extension}`))
  if (double) return double
  // como el Explorador de Windows: «.gitignore» tiene extensión «gitignore»; si no, una regla por extensión no lo alcanza
  const dot = lower.lastIndexOf('.')
  return dot >= 0 ? lower.slice(dot + 1) : ''
}

/** EXT-1: el filtro de la carpeta gana sobre el global. */
export function effectiveFilter(global: ExtensionFilter, root: ExtensionFilter | null): ExtensionFilter {
  return root ?? global
}

export function isIncluded(extension: string, filter: ExtensionFilter): boolean {
  const listed = filter.extensions.map(normalizeExtension).includes(normalizeExtension(extension))
  return filter.mode === 'deny' ? !listed : listed
}

/** Grupos para marcar de un clic en Configuración. */
export const EXTENSION_GROUPS: Record<string, string[]> = {
  temporales: ['tmp', 'crdownload', 'part', 'partial', 'bak'],
  sistema: ['ini', 'lnk', 'db', 'sys', 'dll'],
  codigo: ['js', 'ts', 'json', 'map', 'pyc', 'class'],
  imagenes: ['jpg', 'jpeg', 'png', 'heic', 'gif', 'webp', 'raw', 'dng', 'cr2', 'nef'],
  documentos: ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'pptx', 'txt', 'md'],
  comprimidos: ['zip', '7z', 'rar', 'tar.gz']
}

export const DEFAULT_EXTENSION_FILTER: ExtensionFilter = { mode: 'deny', extensions: ['ini', 'lnk', 'sys', 'dll'] }
