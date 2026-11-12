import { useContext } from 'react'
import type { FileRow } from '@shared/model'
import { ColumnTable } from '../ColumnTable'
import { expiryTone, fileColumns } from '../fileColumns'
import { useActions } from '../actions'
import { call } from '../api'
import { useBackend } from '../data'
import { daysBetween, formatBytes, todayDay } from '../format'
import { LanguageContext, useText } from '../text'
import { Empty, ListHead } from '../ui'
import type { ViewProps } from './view-props'

/** Vistas cortas de la columna central: Duplicados (F-8) y Vencimientos (F-11). Reglas (F-18) va en RulesView. */

/** La insignia Conservar o Propuesta delante de cada copia. */
const STATE_COLUMN_PX = 110

export function DuplicatesView({ detailId, onDetail, logo }: ViewProps & { logo: string }) {
  const t = useText()
  const language = useContext(LanguageContext)
  const actions = useActions()
  const { data } = useBackend('duplicates:list')
  if (data && data.length === 0) return <Empty logo={logo} title={t('duplicates.emptyTitle')} text={t('duplicates.emptyText')} />
  return (
    <div className="view-scroll">
      <ListHead title={t('nav.duplicates')} sub={t('duplicates.sub')} />
      {(data ?? []).map((group) => {
        const keep = group.files.find((file) => file.fileId === group.keepFileId)!
        const copies = group.files.filter((file) => file.fileId !== group.keepFileId)
        return (
          <div className="block" key={group.contentId}>
            <h4 className="ellipsis" title={t('duplicates.group', { name: keep.name, count: group.files.length, size: formatBytes(group.sizeBytes * copies.length, language) })}>{t('duplicates.group', { name: keep.name, count: group.files.length, size: formatBytes(group.sizeBytes * copies.length, language) })}</h4>
            <ColumnTable
              tableId="duplicates"
              title={t('nav.duplicates')}
              style={{ flex: 'none' }}
              rows={group.files}
              rowKey={(file) => file.fileId}
              rowData={(file) => file.fileId}
              catalog={fileColumns<FileRow>(t, language, (file) => file)}
              lead={{ width: STATE_COLUMN_PX, header: <span>{t('table.status')}</span>, cell: (file) => file.fileId === group.keepFileId ? <span className="badge ok" title={t('duplicates.canonical')}>{t('mark.keep')}</span> : <span className="badge new" title={t('duplicates.copy')}>{t('duplicates.proposed')}</span> }}
              rowClass={(file) => `cols-dup ${detailId === file.fileId ? 'on' : ''}`}
              onRowClick={(file, event) => !(event.target as HTMLElement).closest('button') && onDetail(file)}
            />
            <div className="row">
              <button className="btn small primary" type="button" onClick={() => actions.trash(copies)}>{t('duplicates.deleteCopies', { count: copies.length })}</button>
              <button className="btn small" type="button" onClick={() => actions.run(async () => {
                await call('proposals:reject', { fileIds: copies.map((file) => file.fileId) })
                return { text: t('toast.rejected', { count: copies.length }) }
              })}>{t('duplicates.notUseful')}</button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export function ExpiryView({ detailId, onDetail, logo }: ViewProps & { logo: string }) {
  const t = useText()
  const language = useContext(LanguageContext)
  const { data } = useBackend('files:expiring')
  if (data && data.length === 0) return <Empty logo={logo} title={t('expiry.emptyTitle')} text={t('expiry.emptyText')} />
  const today = todayDay()
  return (
    <>
      <ListHead title={t('nav.expiry')} sub={t('expiry.sub')} />
      <ColumnTable
        tableId="expiry"
        title={t('nav.expiry')}
        rows={data ?? []}
        rowKey={(file) => file.fileId}
        rowData={(file) => file.fileId}
        catalog={fileColumns<FileRow>(t, language, (file) => file)}
        rowClass={(file) => `cols-expiry ${expiryTone(daysBetween(today, file.expiresOn!))} ${detailId === file.fileId ? 'on' : ''}`}
        onRowClick={(file, event) => !(event.target as HTMLElement).closest('button') && onDetail(file)}
      />
    </>
  )
}
