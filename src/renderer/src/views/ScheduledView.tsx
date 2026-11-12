import { useContext } from 'react'
import type { FileRow } from '@shared/model'
import { useActions } from '../actions'
import { useBackend } from '../data'
import { ColumnTable } from '../ColumnTable'
import { fileColumns } from '../fileColumns'
import { formatDay } from '../format'
import { LanguageContext, useText } from '../text'
import { Empty, ListHead } from '../ui'
import type { ViewProps } from './view-props'

/** Programados (F-6): lo marcado «Eliminar el…» y «Revisar el…», y el historial de lotes con Deshacer. */
export function ScheduledView({ detailId, onDetail }: ViewProps) {
  const t = useText()
  const { data: files } = useBackend('files:scheduled')
  const { data: batches } = useBackend('batches:list')
  const actions = useActions()
  return (
    <div className="view-scroll">
      <ListHead title={t('nav.scheduled')} sub={t('scheduled.sub')} />
      <ScheduledTable files={files ?? []} detailId={detailId} onDetail={onDetail} withRemove />
      <div className="block">
        <h4>{t('scheduled.batches')}</h4>
        <div className="table" style={{ flex: 'none' }}>
          {(batches ?? []).map((batch) => (
            <div className="tr static cols-batches" key={batch.batchId}>
              <span className="ellipsis" title={batch.description}>{batch.description}</span>
              <span className="muted">{formatDay(batch.createdAt)}</span>
              <span className="num">{batch.files}</span>
              <span>
                {batch.undoneAt ? <span className="badge">{t('scheduled.undone')}</span> : (
                  <button className="btn small" type="button" onClick={() => actions.undo(batch.batchId)}>{t('common.undo')}</button>
                )}
              </span>
            </div>
          ))}
          {batches?.length === 0 && <span className="hint">{t('scheduled.noBatches')}</span>}
        </div>
      </div>
    </div>
  )
}

/** «Quitar» y el ⋮ del encabezado. */
const REMOVE_COLUMN_PX = 100

export function ScheduledTable({ files, detailId, onDetail, withRemove }: ViewProps & { files: FileRow[]; withRemove: boolean }) {
  const t = useText()
  const language = useContext(LanguageContext)
  const actions = useActions()
  if (files.length === 0) return <Empty title={t('scheduled.emptyTitle')} text={t('scheduled.emptyText')} />
  return (
    <ColumnTable
      tableId="scheduled"
      title={t('nav.scheduled')}
      style={{ flex: 'none' }}
      rows={files}
      rowKey={(file) => file.fileId}
      rowData={(file) => file.fileId}
      catalog={fileColumns<FileRow>(t, language, (file) => file)}
      tail={withRemove ? { width: REMOVE_COLUMN_PX, cell: (file) => <button className="btn small" type="button" onClick={() => actions.mark([file], 'unreviewed')}>{t('scheduled.remove')}</button> } : undefined}
      rowClass={(file) => `cols-scheduled ${detailId === file.fileId ? 'on' : ''}`}
      onRowClick={(file, event) => !(event.target as HTMLElement).closest('button') && onDetail(file)}
    />
  )
}
