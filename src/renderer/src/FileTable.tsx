import { useContext, useEffect, useState } from 'react'
import type { FileRow } from '@shared/model'
import { useActions } from './actions'
import { type FileSort, nextSort, sortFiles } from '@shared/file-order'
import { ColumnTable } from './ColumnTable'
import { fileColumns } from './fileColumns'
import { daysSince, MARK_LABEL, ORIGIN_LABEL } from './format'
import { LanguageContext, useText } from './text'

const idleDays = (file: FileRow) => daysSince(file.openedAt ?? file.modifiedAt)
/** La casilla de cada fila: no se elige ni se ensancha. */
const CHECKBOX_COLUMN_PX = 28

interface FileTableProps {
  /** Explorar y Búsqueda usan esta tabla, cada una con su propia elección de columnas */
  tableId: 'explore' | 'search'
  title: string
  files: FileRow[]
  detailId: number | null
  onDetail: (file: FileRow) => void
  /** texto del aviso cuando no hay selección; sin él no se muestra aviso */
  hint?: string
}

/** Tabla de archivos con casillas y barra de selección (F-4, F-16, F-20). Espacio abre la vista previa de lo elegido. */
export function FileTable({ tableId, title, files, detailId, onDetail, hint }: FileTableProps) {
  const t = useText()
  const language = useContext(LanguageContext)
  const actions = useActions()
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [sort, setSort] = useState<FileSort | null>(null)
  const visibleIds = new Set(files.map((file) => file.fileId))
  const chosen = files.filter((file) => selected.has(file.fileId))
  const allChecked = files.length > 0 && chosen.length === files.length

  // lo elegido que ya no está en la lista (borrado, filtrado) sale de la selección
  useEffect(() => {
    setSelected((current) => new Set([...current].filter((id) => visibleIds.has(id))))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- depende del contenido de la lista
  }, [files])

  useEffect(() => {
    const previewOnSpace = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement
      if (event.key !== ' ' || typing || chosen.length === 0 || document.querySelector('.backdrop')) return
      event.preventDefault()
      actions.review(chosen)
    }
    document.addEventListener('keydown', previewOnSpace)
    return () => document.removeEventListener('keydown', previewOnSpace)
  }, [chosen, actions])

  const toggle = (fileId: number) =>
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(fileId)) next.delete(fileId)
      else next.add(fileId)
      return next
    })
  const clear = () => setSelected(new Set())
  const sorted = sortFiles(files, sort, {
    idleDays,
    originLabel: (file) => t(ORIGIN_LABEL[file.origin]),
    markLabel: (file) => t(MARK_LABEL[file.action])
  }, language)

  return (
    <>
      {chosen.length > 0 ? (
        <div className="selbar">
          <b>{t('selection.count', { count: chosen.length })}</b>
          <button className="btn small" type="button" title={t('selection.spaceHint')} onClick={() => actions.review(chosen)}>{t('selection.preview')}</button>
          <button className="btn small" type="button" onClick={() => actions.mark(chosen, 'keep')}>{t('mark.keep')}</button>
          <button className="btn small" type="button" onClick={() => actions.trash(chosen, clear)}>{t('mark.delete')}</button>
          <button className="btn small" type="button" onClick={() => actions.mark(chosen, 'deleteOn')}>{t('selection.deleteOn')}</button>
          <button className="btn small" type="button" onClick={() => actions.mark(chosen, 'review')}>{t('selection.reviewOn')}</button>
          <button className="btn small" type="button" onClick={() => actions.mark(chosen, 'archived')}>{t('mark.archived')}</button>
          <button className="btn small" type="button" onClick={() => actions.tag(chosen)}>{t('selection.tag')}</button>
          <button className="btn small" type="button" onClick={() => actions.mark(chosen, 'unreviewed')}>{t('selection.clearMark')}</button>
          <span className="grow" />
          <button className="btn small" type="button" onClick={clear}>{t('common.cancel')}</button>
        </div>
      ) : (
        hint && <div className="notice">{hint}</div>
      )}
      <ColumnTable
        tableId={tableId}
        title={title}
        rows={sorted}
        rowKey={(file) => file.fileId}
        rowData={(file) => file.fileId}
        catalog={fileColumns<FileRow>(t, language, (file) => file)}
        sort={{ current: sort, onSort: (key) => setSort(nextSort(sort, key)) }}
        lead={{
          width: CHECKBOX_COLUMN_PX,
          header: <input type="checkbox" aria-label={t('selection.all')} checked={allChecked} onChange={(event) => setSelected(new Set(event.target.checked ? files.map((file) => file.fileId) : []))} />,
          cell: (file) => <input type="checkbox" aria-label={t('selection.one', { name: file.name })} checked={selected.has(file.fileId)} onChange={() => toggle(file.fileId)} />
        }}
        rowClass={(file) => `cols-explore ${selected.has(file.fileId) || detailId === file.fileId ? 'on' : ''}`}
        onRowClick={(file, event) => {
          if ((event.target as HTMLElement).closest('input, button')) return
          onDetail(file)
        }}
      />
    </>
  )
}
