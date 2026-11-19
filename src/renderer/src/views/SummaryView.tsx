import { useContext } from 'react'
import type { Origin } from '@shared/model'
import { useBackend } from '../data'
import { formatBytes, formatCount, ORIGIN_LABEL } from '../format'
import { LanguageContext, useText } from '../text'
import { FileLine, FolderActions, ListHead } from '../ui'
import { ScheduledTable } from './ScheduledView'
import type { ViewProps } from './view-props'

/** «C:\Users\ana\Capacitación» → nombre «Capacitación», carpeta que la contiene «C:\Users\ana». */
function splitFolder(folder: string): { name: string; parent: string } {
  const cut = folder.lastIndexOf('\\')
  if (cut < 0) return { name: folder, parent: '' }
  return { name: folder.slice(cut + 1), parent: folder.slice(0, cut) }
}

/** Resumen (lámina 4): lo que se puede liberar y lo que vence. */
export function SummaryView({ detailId, onDetail }: ViewProps) {
  const t = useText()
  const language = useContext(LanguageContext)
  const { data } = useBackend('summary:get')
  if (!data) return <ListHead title={t('nav.summary')} />
  const totalBytes = Math.max(1, data.byOrigin.reduce((total, entry) => total + entry.bytes, 0))
  return (
    <div className="view-scroll">
      <ListHead title={t('nav.summary')} sub={t('summary.sub')} />
      <div className="stats">
        <div className="stat accent"><b>{formatCount(data.files, language)}</b><span>{t('summary.indexed')}</span></div>
        <div className="stat accent"><b>{formatBytes(data.proposalBytes, language)}</b><span>{t('summary.recoverable')}</span></div>
        <div className="stat"><b>{formatCount(data.proposals, language)}</b><span>{t('summary.proposals')}</span></div>
        <div className="stat"><b>{formatCount(data.expiring, language)}</b><span>{t('summary.expiring')}</span></div>
      </div>
      <div className="two-blocks">
        <div className="block">
          <h4>{t('summary.byOrigin')}</h4>
          {data.byOrigin.map((entry) => (
            <div className="meter" key={entry.origin}>
              <span className="ellipsis" title={t(ORIGIN_LABEL[entry.origin as Origin] ?? 'origin.unknown')}>{t(ORIGIN_LABEL[entry.origin as Origin] ?? 'origin.unknown')}</span>
              <span className="progress"><i style={{ width: `${Math.round((entry.bytes / totalBytes) * 100)}%` }} /></span>
              <span className="muted" style={{ textAlign: 'right' }}>{formatBytes(entry.bytes, language)}</span>
            </div>
          ))}
        </div>
        <div className="block">
          <h4>{t('summary.stale')}</h4>
          {data.staleFolders.length === 0 && <span className="hint">{t('summary.noStale')}</span>}
          {data.staleFolders.map((entry) => {
            const { name, parent } = splitFolder(entry.folder)
            return (
              <div className="file-row" key={entry.folder}>
                <FileLine name={name} folder={parent} />
                <span className="size">{formatBytes(entry.bytes, language)}</span>
                <FolderActions folder={entry.folder} />
              </div>
            )
          })}
        </div>
      </div>
      <div className="list-head" style={{ paddingTop: 4 }}><span className="list-title sub-title">{t('summary.next')}</span></div>
      <ScheduledTable files={data.nextScheduled} detailId={detailId} onDetail={onDetail} withRemove={false} />
    </div>
  )
}
