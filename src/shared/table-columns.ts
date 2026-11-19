import { z } from 'zod'

/**
 * Columnas a elección y ancho ajustable de cada tabla (lámina 14). Lógica pura: qué columnas tiene cada tabla, cuáles
 * vienen encendidas, sus anchos de fábrica y mínimos, y cómo se lee una elección guardada que puede venir rota.
 */

export const TABLE_IDS = ['explore', 'search', 'proposals', 'scheduled', 'expiry', 'duplicates', 'folders'] as const
export type TableId = (typeof TABLE_IDS)[number]

export const COLUMN_IDS = [
  'name', 'rule', 'due', 'expires', 'status', 'kind', 'ext', 'origin', 'site', 'activity', 'opened', 'modified', 'size', 'mark', 'tags', 'note',
  'path', 'files', 'extensions', 'folderMark', 'folderTags'
] as const
export type ColumnId = (typeof COLUMN_IDS)[number]

interface ColumnSpec {
  /** ancho de fábrica en px; para la columna que siempre se ve es su mínimo antes de tomar el sobrante */
  width: number
  /** por debajo de esto el título deja de leerse entero */
  min: number
  /** no se puede ocultar: sin ella la fila no dice de qué archivo o carpeta se trata */
  always?: boolean
}

export const COLUMN_SPECS: Record<ColumnId, ColumnSpec> = {
  name: { width: 136, min: 120, always: true },
  rule: { width: 170, min: 90 },
  due: { width: 180, min: 150 },
  expires: { width: 110, min: 80 },
  status: { width: 130, min: 110 },
  kind: { width: 150, min: 80 },
  ext: { width: 100, min: 100 },
  origin: { width: 80, min: 80 },
  site: { width: 170, min: 140 },
  activity: { width: 100, min: 100 },
  opened: { width: 110, min: 90 },
  modified: { width: 120, min: 110 },
  size: { width: 84, min: 84 },
  mark: { width: 130, min: 80 },
  tags: { width: 150, min: 100 },
  note: { width: 180, min: 80 },
  path: { width: 150, min: 120, always: true },
  files: { width: 110, min: 100 },
  extensions: { width: 120, min: 120 },
  folderMark: { width: 200, min: 160 },
  folderTags: { width: 150, min: 100 }
}

/** Las que toda tabla de archivos ofrece en su ⋮, después de las propias de cada una. */
const FILE_EXTRA: ColumnId[] = ['kind', 'ext', 'origin', 'site', 'activity', 'opened', 'modified', 'size', 'mark', 'tags', 'note']

export const TABLES: Record<TableId, { columns: ColumnId[]; defaults: ColumnId[] }> = {
  explore: { columns: ['name', ...FILE_EXTRA], defaults: ['name', 'origin', 'activity', 'size', 'mark'] },
  search: { columns: ['name', ...FILE_EXTRA], defaults: ['name', 'origin', 'activity', 'size', 'mark'] },
  proposals: { columns: ['name', 'rule', ...FILE_EXTRA], defaults: ['name', 'rule', 'size'] },
  scheduled: { columns: ['name', 'due', ...FILE_EXTRA], defaults: ['name', 'due', 'size'] },
  expiry: { columns: ['name', 'expires', 'status', ...FILE_EXTRA], defaults: ['name', 'expires', 'status', 'mark'] },
  duplicates: { columns: ['name', ...FILE_EXTRA], defaults: ['name', 'modified', 'size'] },
  folders: { columns: ['path', 'files', 'extensions', 'folderMark', 'folderTags'], defaults: ['path', 'files', 'extensions'] }
}

/** Lo que se guarda por tabla en las preferencias. Sin `visible`, las de fábrica; sin un ancho, el de fábrica. */
export interface TableLayout {
  visible?: ColumnId[]
  widths?: Partial<Record<ColumnId, number>>
}

const ColumnIdSchema = z.enum(COLUMN_IDS)
const TableLayoutSchema = z.object({
  visible: z.array(ColumnIdSchema).optional(),
  // partialRecord: en zod 4 un record con claves enum exige todas; aquí se guarda solo lo que se ensanchó
  widths: z.partialRecord(ColumnIdSchema, z.number().positive()).optional()
})

/** La elección guardada de una tabla; si viene rota (editada a mano, de otra versión), la de fábrica y `broken`. */
export function readLayout(raw: unknown): { layout: TableLayout; broken: boolean } {
  if (raw === undefined) return { layout: {}, broken: false }
  const parsed = TableLayoutSchema.safeParse(raw)
  return parsed.success ? { layout: parsed.data, broken: false } : { layout: {}, broken: true }
}

/** En el orden de la tabla; la que siempre se ve está aunque la elección guardada la omita. */
export function visibleColumns(tableId: TableId, layout: TableLayout): ColumnId[] {
  const chosen = layout.visible ?? TABLES[tableId].defaults
  return TABLES[tableId].columns.filter((id) => COLUMN_SPECS[id].always || chosen.includes(id))
}

export function toggleColumn(tableId: TableId, layout: TableLayout, columnId: ColumnId, shown: boolean): TableLayout {
  if (COLUMN_SPECS[columnId].always) return layout
  const current = visibleColumns(tableId, layout)
  const visible = TABLES[tableId].columns.filter((id) => (id === columnId ? shown : current.includes(id)))
  return { ...layout, visible }
}

export const widthOf = (layout: TableLayout, columnId: ColumnId) => layout.widths?.[columnId] ?? COLUMN_SPECS[columnId].width

/** Nunca por debajo del mínimo de la columna: su título se sigue leyendo entero. */
export function resizeColumn(layout: TableLayout, columnId: ColumnId, width: number): TableLayout {
  const clamped = Math.max(COLUMN_SPECS[columnId].min, Math.round(width))
  return { ...layout, widths: { ...layout.widths, [columnId]: clamped } }
}

export function resetColumnWidth(layout: TableLayout, columnId: ColumnId): TableLayout {
  const widths = { ...layout.widths }
  delete widths[columnId]
  return { ...layout, widths }
}

/** Columnas fijas de una tabla que no se eligen: la casilla o el estado delante, las acciones detrás. */
export interface FixedTracks {
  lead?: number
  tail: number
}

/**
 * `grid-template-columns`. Mientras nadie la ajustó, la columna que siempre se ve toma el sobrante (lo de fábrica cabe
 * sin desplazar). Ajustada, queda en su ancho como las demás y el sobrante pasa a las acciones del final: si siguiera
 * tomando el sobrante, achicarla no tendría ningún efecto en pantalla.
 */
export function gridTemplate(tableId: TableId, layout: TableLayout, fixed: FixedTracks): string {
  const columns = visibleColumns(tableId, layout)
  const flexible = columns.find((id) => COLUMN_SPECS[id].always && layout.widths?.[id] === undefined)
  const tracks = columns.map((id) => (id === flexible ? `minmax(${widthOf(layout, id)}px, 1fr)` : `${widthOf(layout, id)}px`))
  const tail = flexible ? `${fixed.tail}px` : `minmax(${fixed.tail}px, 1fr)`
  return [fixed.lead === undefined ? null : `${fixed.lead}px`, ...tracks, tail].filter(Boolean).join(' ')
}

/** Las filas de familia.css: 12 px entre columnas y 16 px de margen a cada lado. */
const ROW_GAP_PX = 12
const ROW_PADDING_PX = 32

/**
 * Ancho mínimo de cada fila. Cada fila es su propia grilla: con el mismo mínimo, el sobrante se reparte igual en todas
 * y las columnas quedan alineadas; si la suma pasa el ancho de la vista, la tabla se desplaza hacia el costado.
 */
export function minTableWidth(tableId: TableId, layout: TableLayout, fixed: FixedTracks): number {
  const columns = visibleColumns(tableId, layout).map((id) => widthOf(layout, id))
  const tracks = [...(fixed.lead === undefined ? [] : [fixed.lead]), ...columns, fixed.tail]
  const total = tracks.reduce((sum, width) => sum + width, 0)
  return total + ROW_GAP_PX * (tracks.length - 1) + ROW_PADDING_PX
}
