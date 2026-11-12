import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import type { FileSort, SortKey } from '@shared/file-order'
import { COLUMN_SPECS, gridTemplate, minTableWidth, readLayout, resetColumnWidth, resizeColumn, TABLES, toggleColumn, visibleColumns, type ColumnId, type FixedTracks, type TableId, type TableLayout } from '@shared/table-columns'
import type { ColumnCatalog } from './fileColumns'
import { MoreIcon } from './icons'
import { useText } from './text'

/**
 * Tabla con columnas a elección y ancho ajustable (lámina 14). El ⋮ del encabezado abre la ventana de columnas de esa
 * tabla; el borde de cada título se arrastra. La elección vive en las preferencias: se mantiene al reiniciar.
 */

export interface TableLayouts {
  layouts: Record<string, unknown>
  save: (tableId: TableId, layout: TableLayout) => void
}
export const TableLayoutsContext = createContext<TableLayouts>({ layouts: {}, save: () => undefined })

/** Lo que el ⋮ necesita a su derecha para no tapar el último título. */
const TAIL_WIDTH_PX = 40
const PANEL_GAP_PX = 4
/** Margen bajo la ventana de columnas: en una ventana baja se desplaza por dentro en vez de cortarse. */
const PANEL_BOTTOM_MARGIN_PX = 12

type PanelPlace = { top: number; right: number; maxHeight: number; overflowY: 'auto' }

interface FixedColumn<Row> {
  width: number
  header?: ReactNode
  cell: (row: Row) => ReactNode
}

interface ColumnTableProps<Row> {
  tableId: TableId
  /** nombre de la tabla en la ventana de columnas: «Columnas de Explorar» */
  title: string
  rows: Row[]
  rowKey: (row: Row) => number | string
  catalog: ColumnCatalog<Row>
  /** casilla o estado delante: no se elige */
  lead?: FixedColumn<Row>
  /** acciones detrás: no se eligen; el ⋮ del encabezado va en su lugar */
  tail?: FixedColumn<Row>
  /** clase de cada fila: la que ya usaban las vistas (`cols-explore`) más la que depende de la fila */
  rowClass: (row: Row) => string
  onRowClick?: (row: Row, event: MouseEvent<HTMLDivElement>) => void
  rowData?: (row: Row) => number
  sort?: { current: FileSort | null; onSort: (key: SortKey) => void }
  empty?: ReactNode
  style?: CSSProperties
}

export function ColumnTable<Row>({ tableId, title, rows, rowKey, catalog, lead, tail, rowClass, onRowClick, rowData, sort, empty, style }: ColumnTableProps<Row>) {
  const t = useText()
  const { layouts, save } = useContext(TableLayoutsContext)
  const stored = readLayout(layouts[tableId]).layout
  // lo que se cambió y todavía no volvió guardado (prefs:changed): se ve al instante, sin esperar al backend; al
  // arrastrar un borde se actualiza en cada movimiento y se guarda una sola vez, al soltar
  const [pending, setPending] = useState<TableLayout | null>(null)
  const [panel, setPanel] = useState<PanelPlace | null>(null)
  const layout = pending ?? stored
  useEffect(() => setPending(null), [layouts[tableId]])
  const apply = (next: TableLayout) => {
    setPending(next)
    save(tableId, next)
  }
  const fixed: FixedTracks = { lead: lead?.width, tail: tail?.width ?? TAIL_WIDTH_PX }
  const columns = visibleColumns(tableId, layout).filter((id) => catalog[id])
  const rowStyle: CSSProperties = { ['--cols' as string]: gridTemplate(tableId, layout, fixed) }

  const startResize = (columnId: ColumnId, start: MouseEvent<HTMLElement>) => {
    start.preventDefault()
    start.stopPropagation()
    // el ancho en pantalla, no el guardado: Nombre puede estar tomando el sobrante y medir más que su ancho guardado
    const startWidth = (start.currentTarget.parentElement as HTMLElement).getBoundingClientRect().width
    let latest = layout
    const move = (event: globalThis.MouseEvent) => {
      latest = resizeColumn(layout, columnId, startWidth + event.clientX - start.clientX)
      setPending(latest)
    }
    const stop = () => {
      document.removeEventListener('mousemove', move)
      document.removeEventListener('mouseup', stop)
      if (latest === layout) setPending(null)
      else save(tableId, latest)
    }
    document.addEventListener('mousemove', move)
    document.addEventListener('mouseup', stop)
  }
  const openPanel = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (panel) return setPanel(null)
    const box = event.currentTarget.getBoundingClientRect()
    const top = box.bottom + PANEL_GAP_PX
    setPanel({ top, right: window.innerWidth - box.right, maxHeight: window.innerHeight - top - PANEL_BOTTOM_MARGIN_PX, overflowY: 'auto' })
  }

  const header = (columnId: ColumnId) => {
    const column = catalog[columnId]!
    const sortable = sort && column.sortKey
    const active = sortable && sort.current?.key === column.sortKey
    let arrow = ''
    if (active) arrow = sort.current!.direction === 'asc' ? '▲' : '▼'
    return (
      <span key={columnId} className={`col-th ${column.numeric ? 'num' : ''}`}>
        {sortable ? (
          <button type="button" className={`th-sort ${active ? 'on' : ''}`} data-sort={column.sortKey} title={t('table.sortBy', { column: column.label })} onClick={() => sort.onSort(column.sortKey!)}>
            {column.label}<span className="arrow">{arrow}</span>
          </button>
        ) : <span className="ellipsis" title={column.label}>{column.label}</span>}
        <i className="col-grip" title={t('columns.resize')} onMouseDown={(event) => startResize(columnId, event)} onDoubleClick={() => apply(resetColumnWidth(layout, columnId))} />
      </span>
    )
  }

  return (
    <div className="table col-table" data-table={tableId} style={{ ...style, ['--table-min' as string]: `${minTableWidth(tableId, layout, fixed)}px` }}>
      <div className="tr th" style={rowStyle}>
        {lead && (lead.header ?? <span />)}
        {columns.map(header)}
        <span className="col-tail">
          {tail?.header}
          <button className={`icon-btn ${panel ? 'on' : ''}`} type="button" data-columns={tableId} title={t('columns.button')} aria-label={t('columns.title', { table: title })} aria-haspopup="dialog" aria-expanded={panel !== null} onClick={openPanel}><MoreIcon /></button>
        </span>
      </div>
      {rows.length === 0 && empty}
      {rows.map((row) => (
        <div key={rowKey(row)} className={`tr ${rowClass(row)}`} style={rowStyle} data-file={rowData?.(row)} onClick={onRowClick ? (event) => onRowClick(row, event) : undefined}>
          {lead?.cell(row)}
          {columns.map((columnId) => <span key={columnId} className={`col-td ${catalog[columnId]!.numeric ? 'num' : ''}`}>{catalog[columnId]!.render(row)}</span>)}
          <span className="col-tail">{tail?.cell(row)}</span>
        </div>
      ))}
      {panel && <ColumnsPanel tableId={tableId} title={title} catalog={catalog} layout={layout} place={panel} onSave={apply} onClose={() => setPanel(null)} />}
    </div>
  )
}

interface ColumnsPanelProps<Row> {
  tableId: TableId
  title: string
  catalog: ColumnCatalog<Row>
  layout: TableLayout
  place: PanelPlace
  onSave: (layout: TableLayout) => void
  onClose: () => void
}

/** Ventana flotante con las columnas de una tabla. Cada casilla se guarda al instante; se cierra con clic fuera o Escape. */
function ColumnsPanel<Row>({ tableId, title, catalog, layout, place, onSave, onClose }: ColumnsPanelProps<Row>) {
  const t = useText()
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const closeOutside = (event: globalThis.MouseEvent) => !panelRef.current?.contains(event.target as Node) && onClose()
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('mousedown', closeOutside)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOutside)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [onClose])
  const shown = visibleColumns(tableId, layout)
  return (
    <div ref={panelRef} className="ctx cols-panel" role="dialog" aria-label={t('columns.title', { table: title })} style={place} onClick={(event) => event.stopPropagation()}>
      <b className="cols-title">{t('columns.title', { table: title })}</b>
      {TABLES[tableId].columns.filter((id) => catalog[id]).map((id) => (
        <label key={id}>
          <input type="checkbox" data-column={id} checked={shown.includes(id)} disabled={COLUMN_SPECS[id].always} onChange={(event) => onSave(toggleColumn(tableId, layout, id, event.target.checked))} />
          {catalog[id]!.label}
          {COLUMN_SPECS[id].always && <small>{t('columns.always')}</small>}
        </label>
      ))}
      <div className="ctx-separator" />
      <span className="hint">{t('columns.saved')}</span>
      <button type="button" className="link-btn" onClick={() => onSave({})}>{t('columns.reset')}</button>
    </div>
  )
}
