import { useEffect, useState, type MouseEvent, type ReactNode } from 'react'
import { runsWhenOpened } from '@shared/file-open'
import type { FileRow } from '@shared/model'
import { folderOf, formatDay, MARK_LABEL, MARK_TONE } from './format'
import { FolderIcon, MoreIcon, OpenIcon } from './icons'
import { useText } from './text'

/** Piezas pequeñas que comparten las vistas. */

/**
 * La forma única de un archivo (o carpeta) en una lista: el nombre arriba y la carpeta abajo, recortada por el INICIO
 * (dirección rtl), porque lo que distingue una ruta de otra es su final. El <bdi> mantiene el texto en su orden.
 */
export function FileLine({ name, folder, extra }: { name: ReactNode; folder: string; extra?: ReactNode }) {
  return (
    <span className="file-line">
      <span className="file-name ellipsis" title={typeof name === 'string' ? name : undefined}>{name}</span>
      <span className="file-folder" title={folder}><bdi>{folder}</bdi></span>
      {extra}
    </span>
  )
}

export const FileNameLine = ({ file, extra }: { file: FileRow; extra?: ReactNode }) => <FileLine name={file.name} folder={folderOf(file)} extra={extra} />

/** Abrir y Mostrar en carpeta, visibles al pasar el mouse por la fila o al llegar con el teclado. */
export function FileActions({ file }: { file: FileRow }) {
  const t = useText()
  return (
    <span className="row-acts">
      {!runsWhenOpened(file.name) && (
        <button className="icon-btn" type="button" title={t('file.open')} aria-label={t('file.open')} onClick={() => void window.purga.openFileWith(file.fileId)}><OpenIcon /></button>
      )}
      <button className="icon-btn" type="button" title={t('detail.reveal')} aria-label={t('detail.reveal')} onClick={() => void window.purga.revealFile(file.fileId)}><FolderIcon /></button>
    </span>
  )
}

export interface MoreItem {
  label: string
  /** una línea de por qué, bajo la opción */
  hint?: string
  action: () => void
}
/** `null` es un separador. */
type MoreEntry = MoreItem | null

const MENU_GAP_PX = 4

/** Dónde va el panel: desde la derecha (bajo un botón ⋮) o desde la izquierda (donde se hizo clic derecho). */
export type MenuPlace = { top: number; right: number } | { top: number; left: number }

/**
 * Panel de opciones `position: fixed`: dentro de una tabla con scroll uno absoluto quedaría recortado. Se cierra con
 * un clic fuera, Escape o al hacer scroll.
 */
export function MenuPanel({ place, items, onClose }: { place: MenuPlace; items: MoreEntry[]; onClose: () => void }) {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('click', onClose)
    document.addEventListener('contextmenu', onClose)
    document.addEventListener('keydown', closeOnEscape)
    document.addEventListener('scroll', onClose, true)
    return () => {
      document.removeEventListener('click', onClose)
      document.removeEventListener('contextmenu', onClose)
      document.removeEventListener('keydown', closeOnEscape)
      document.removeEventListener('scroll', onClose, true)
    }
  }, [onClose])
  return (
    <div className="ctx more-menu" role="menu" style={place}>
      {items.map((item, index) =>
        item ? (
          <button type="button" role="menuitem" key={item.label} className={item.hint ? 'with-hint' : ''} onClick={(event) => {
            event.stopPropagation()
            onClose()
            item.action()
          }}>
            <span>{item.label}</span>
            {item.hint && <small>{item.hint}</small>}
          </button>
        ) : (
          <div className="ctx-separator" key={`separator-${index}`} />
        )
      )}
    </div>
  )
}

/** Botón ⋮ con más opciones; el panel se ubica desde el botón. */
export function MoreMenu({ items }: { items: MoreEntry[] }) {
  const t = useText()
  const [place, setPlace] = useState<MenuPlace | null>(null)
  const toggle = (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    if (place) return setPlace(null)
    const box = event.currentTarget.getBoundingClientRect()
    setPlace({ top: box.bottom + MENU_GAP_PX, right: window.innerWidth - box.right })
  }
  return (
    <>
      <button className={`icon-btn ${place ? 'on' : ''}`} type="button" title={t('proposals.more')} aria-label={t('proposals.more')} aria-haspopup="menu" aria-expanded={place !== null} onClick={toggle}><MoreIcon /></button>
      {place && <MenuPanel place={place} items={items} onClose={() => setPlace(null)} />}
    </>
  )
}

export function FolderActions({ folder }: { folder: string }) {
  const t = useText()
  return (
    <span className="row-acts">
      <button className="icon-btn" type="button" title={t('file.openFolder')} aria-label={t('file.openFolder')} onClick={() => void window.purga.openFolder(folder)}><FolderIcon /></button>
    </span>
  )
}

export function MarkBadge({ file }: { file: FileRow }) {
  const t = useText()
  if (file.closedReason === 'modified') return <span className="badge warn">{t('mark.changedAfter')}</span>
  if (file.closedReason === 'missing') return <span className="badge">{t('mark.gone')}</span>
  if (file.closedReason === 'needsConfirmation') return <span className="badge err">{t('mark.needsConfirmation')}</span>
  const when = file.dueDate ? ` ${formatDay(file.dueDate)}` : ''
  const expires = file.action === 'keep' && file.expiresOn ? ` · ${t('mark.expires', { date: formatDay(file.expiresOn) })}` : ''
  return <span className={`badge ${MARK_TONE[file.action]}`}>{t(MARK_LABEL[file.action])}{when}{expires}</span>
}

/** El texto completo de la marca, para el `title` de una celda angosta. */
export function markTitle(t: ReturnType<typeof useText>, file: FileRow): string {
  const when = file.dueDate ? ` ${formatDay(file.dueDate)}` : ''
  return `${t(MARK_LABEL[file.action])}${when}`
}

export function TagChips({ file }: { file: FileRow }) {
  return (
    <>
      {file.tags.map((tag) => (
        <span className="badge" key={tag.name} title={tag.source}>#{tag.name}</span>
      ))}
    </>
  )
}

export function Empty({ logo, title, text, children }: { logo?: string; title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {logo && <img className="empty-logo" src={logo} alt="" />}
      <b>{title}</b>
      {text && <span>{text}</span>}
      {children}
    </div>
  )
}

export function ListHead({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="list-head">
      <span className="list-title">{title}</span>
      {sub && <span className="list-sub">{sub}</span>}
      {children && <span className="list-actions">{children}</span>}
    </div>
  )
}

export interface ToastMessage {
  text: string
  /** «Deshacer» en el aviso: deshace el lote que lo produjo */
  undoBatchId?: number | null
}

/** Cuánto queda visible un aviso; con Deshacer, más, para alcanzar a usarlo. */
const TOAST_MS = 4_000
const TOAST_WITH_UNDO_MS = 8_000

export function Toast({ message, onUndo, onDone }: { message: ToastMessage; onUndo: (batchId: number) => void; onDone: () => void }) {
  const t = useText()
  const undoable = message.undoBatchId != null
  useEffect(() => {
    const timer = setTimeout(onDone, undoable ? TOAST_WITH_UNDO_MS : TOAST_MS)
    return () => clearTimeout(timer)
  }, [message, onDone, undoable])
  return (
    <div className="toast" role="status">
      <span>{message.text}</span>
      {undoable && (
        <button className="btn small" type="button" onClick={() => onUndo(message.undoBatchId!)}>
          {t('common.undo')}
        </button>
      )}
    </div>
  )
}
