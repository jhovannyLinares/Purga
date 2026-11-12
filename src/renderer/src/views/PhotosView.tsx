import { useContext, useEffect, useState, type ReactNode } from 'react'
import type { Root } from '@shared/model'
import { dateFolder, type Granularity, type PhotoInfo, type SimilarGroup } from '@shared/photos'
import type { Preview } from '@shared/preview'
import { useActions } from '../actions'
import { call } from '../api'
import { useBackend } from '../data'
import { Dialog } from '../Dialog'
import { formatBytes, formatDay } from '../format'
import { LanguageContext, useText } from '../text'
import { Empty, ListHead } from '../ui'
import type { ViewProps } from './view-props'

type PhotoTab = 'similar' | 'bydate'

/** Fotos (lámina 10): parecidas, con la mejor propuesta para conservar (F-9), y orden por fecha (F-10). */
export function PhotosView({ tab, onTab, roots, rootId, detailId, onDetail, logo }: ViewProps & { tab: PhotoTab; onTab: (tab: PhotoTab) => void; roots: Root[]; rootId: number | null; logo: string }) {
  const t = useText()
  const tabs = (
    <div className="tabs">
      <button type="button" className={tab === 'similar' ? 'on' : ''} onClick={() => onTab('similar')}>{t('photos.similar')}</button>
      <button type="button" className={tab === 'bydate' ? 'on' : ''} onClick={() => onTab('bydate')}>{t('photos.byDate')}</button>
    </div>
  )
  const root = roots.find((candidate) => candidate.rootId === rootId) ?? roots[0] ?? null
  return (
    <div className="view-scroll">
      {tab === 'similar' ? <SimilarPhotos tabs={tabs} detailId={detailId} onDetail={onDetail} logo={logo} /> : <PhotosByDate tabs={tabs} root={root} />}
    </div>
  )
}

function SimilarPhotos({ tabs, onDetail, logo }: ViewProps & { tabs: ReactNode; logo: string }) {
  const t = useText()
  const actions = useActions()
  const { data } = useBackend('photos:similar')
  return (
    <>
      <ListHead title={t('photos.similarTitle')} sub={t('photos.similarSub')} />
      {tabs}
      {data && data.length === 0 && <Empty logo={logo} title={t('photos.noSimilarTitle')} text={t('photos.noSimilarText')} />}
      {(data ?? []).map((group) => {
        const others = group.photos.filter((photo) => photo.file.fileId !== group.chosenFileId)
        return (
          <div className="block" key={group.groupKey}>
            <div className="row">
              <h4 className="grow ellipsis" title={t('photos.groupTitle', { day: formatDay(group.photos[0]!.day), count: group.photos.length })}>{t('photos.groupTitle', { day: formatDay(group.photos[0]!.day), count: group.photos.length })}</h4>
              <button className="btn small primary" type="button" onClick={() => actions.trash(others.map((photo) => photo.file))}>{t('photos.keepBest')}</button>
            </div>
            <div className="photo-group">
              {group.photos.map((photo) => <PhotoCard key={photo.file.fileId} group={group} photo={photo} onDetail={onDetail} />)}
            </div>
            <span className="hint">{t('photos.criteria')}</span>
          </div>
        )
      })}
    </>
  )
}

function PhotoCard({ group, photo, onDetail }: { group: SimilarGroup; photo: PhotoInfo; onDetail: ViewProps['onDetail'] }) {
  const t = useText()
  const language = useContext(LanguageContext)
  const actions = useActions()
  const thumbnail = useThumbnail(photo.file.fileId)
  const chosen = group.chosenFileId === photo.file.fileId
  const prefer = () => actions.run(async () => {
    await call('photos:prefer', { groupKey: group.groupKey, fileId: photo.file.fileId })
    return null
  })
  const format = `${photo.file.extension.toUpperCase()}${photo.jpegQuality ? ` · ${t('photos.quality', { quality: photo.jpegQuality })}` : ''}`
  return (
    <div className={chosen ? 'photo best' : 'photo'} onClick={prefer} onDoubleClick={() => onDetail(photo.file)}>
      <div className={thumbnail ? 'thumb has-image' : 'thumb'}>
        {thumbnail && <img src={thumbnail} alt="" />}
        <span>{photo.width} × {photo.height}</span>
      </div>
      <div className="meta">
        <b title={photo.file.name}>{photo.file.name}</b>
        <span>{format} · {formatBytes(photo.file.sizeBytes, language)}</span>
        <span className="muted">{photo.hasExif ? t('photos.withExif') : t('photos.noExif')} · {formatDay(photo.day)}</span>
        <span>{chosen ? <span className="badge ok">{t('photos.best')}</span> : <span className="badge new">{t('photos.proposeDelete')}</span>}</span>
      </div>
    </div>
  )
}

function useThumbnail(fileId: number): string | null {
  const [thumbnail, setThumbnail] = useState<string | null>(null)
  useEffect(() => {
    let current = true
    window.purga.preview(fileId).then((preview: Preview) => {
      if (current && (preview.kind === 'image' || preview.kind === 'thumbnail')) setThumbnail(preview.dataUrl)
    }, () => undefined)
    return () => {
      current = false
    }
  }, [fileId])
  return thumbnail
}

interface DayGroup {
  day: string
  photos: PhotoInfo[]
  lowConfidence: boolean
  source: PhotoInfo['dateSource']
}

function groupByDay(photos: PhotoInfo[]): DayGroup[] {
  const byDay = new Map<string, PhotoInfo[]>()
  for (const photo of photos) byDay.set(photo.day, [...(byDay.get(photo.day) ?? []), photo])
  return [...byDay].sort(([left], [right]) => left.localeCompare(right)).map(([day, list]) => ({
    day,
    photos: list,
    lowConfidence: list.some((photo) => photo.dateSource === 'modified'),
    source: list.some((photo) => photo.dateSource === 'modified') ? 'modified' : list.some((photo) => photo.dateSource === 'name') ? 'name' : 'exif'
  }))
}

const SOURCE_TEXT = { exif: 'photos.sourceExif', name: 'photos.sourceName', modified: 'photos.sourceModified' } as const

function PhotosByDate({ tabs, root }: { tabs: ReactNode; root: Root | null }) {
  const t = useText()
  const { data } = useBackend('photos:ofRoot', { rootId: root?.rootId ?? 0 })
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [mode, setMode] = useState<'move' | 'copy' | null>(null)
  const days = groupByDay(data ?? [])
  const chosen = days.filter((group) => picked.has(group.day))
  const photoCount = chosen.reduce((total, group) => total + group.photos.length, 0)
  if (!root) return <>{tabs}<Empty title={t('explore.pickTitle')} text={t('explore.pickText')} /></>
  return (
    <>
      <ListHead title={t('photos.byDateTitle')} sub={t('photos.byDateSub', { name: root.name, count: data?.length ?? 0 })} />
      {tabs}
      {chosen.length ? (
        <div className="selbar">
          <b>{t('photos.daysPicked', { days: chosen.length, count: photoCount })}</b>
          <button className="btn small primary" type="button" onClick={() => setMode('move')}>{t('photos.move')}</button>
          <button className="btn small" type="button" onClick={() => setMode('copy')}>{t('photos.copy')}</button>
        </div>
      ) : <div className="notice">{t('photos.byDateHint')}</div>}
      <div className="table" style={{ flex: 'none' }}>
        <div className="tr th cols-dates"><span /><span>{t('table.day')}</span><span className="num">{t('nav.photos')}</span><span>{t('photos.destination')}</span><span>{t('photos.dateFrom')}</span></div>
        {days.map((group) => (
          <div key={group.day} className={`tr cols-dates ${picked.has(group.day) ? 'on' : ''}`}>
            <input type="checkbox" aria-label={group.day} checked={picked.has(group.day)} onChange={() => setPicked((current) => {
              const next = new Set(current)
              if (next.has(group.day)) next.delete(group.day)
              else next.add(group.day)
              return next
            })} />
            <span className="mono">{formatDay(group.day)}</span>
            <span className="num">{group.photos.length}</span>
            <span className="mono ellipsis" title={dateFolder(group.day, 'day')}>{dateFolder(group.day, 'day')}</span>
            <span className="ellipsis" title={t(SOURCE_TEXT[group.source])}>{group.lowConfidence ? <span className="badge warn">{t(SOURCE_TEXT[group.source])} · {t('photos.confirm')}</span> : <span className="badge ok">{t(SOURCE_TEXT[group.source])}</span>}</span>
          </div>
        ))}
      </div>
      {mode && <OrganizeDialog mode={mode} days={chosen} onClose={() => setMode(null)} onDone={() => setPicked(new Set())} />}
    </>
  )
}

function OrganizeDialog({ mode: initialMode, days, onClose, onDone }: { mode: 'move' | 'copy'; days: DayGroup[]; onClose: () => void; onDone: () => void }) {
  const t = useText()
  const language = useContext(LanguageContext)
  const actions = useActions()
  const [mode, setMode] = useState(initialMode)
  const [destination, setDestination] = useState('')
  const [granularity, setGranularity] = useState<Granularity>('day')
  const photos = days.flatMap((group) => group.photos)
  const bytes = photos.reduce((total, photo) => total + photo.file.sizeBytes, 0)
  const lowConfidence = photos.filter((photo) => photo.dateSource === 'modified').length
  const verb = t(mode === 'move' ? 'photos.moveVerb' : 'photos.copyVerb')
  const pick = async () => {
    const folder = await window.purga.pickFolder()
    if (folder) setDestination(folder)
  }
  const confirm = () => {
    onClose()
    actions.run(async () => {
      const result = await call('photos:organize', { fileIds: photos.map((photo) => photo.file.fileId), destination, granularity, mode })
      onDone()
      return { text: t('toast.organized', { count: result.done, folders: result.folders, skipped: result.skipped }), undoBatchId: result.batchId }
    })
  }
  const footer = (
    <>
      <button className="btn" type="button" onClick={onClose}>{t('common.cancel')}</button>
      <button className="btn primary" type="button" disabled={!destination} onClick={confirm}>{t('photos.organizeConfirm', { verb, count: days.length })}</button>
    </>
  )
  return (
    <Dialog title={t('photos.organizeTitle', { verb, count: photos.length })} wide footer={footer} onClose={onClose}>
      <div className="field">
        <span className="label accent">{t('photos.destination')}</span>
        <div className="row"><input className="grow mono" value={destination} onChange={(event) => setDestination(event.target.value)} /><button className="btn" type="button" onClick={() => void pick()}>{t('common.choose')}</button></div>
      </div>
      <div className="field">
        <span className="label accent">{t('photos.oneFolderPer')}</span>
        <div className="segmented">
          {(['year', 'month', 'day'] as const).map((option) => <button type="button" key={option} className={granularity === option ? 'on' : ''} onClick={() => setGranularity(option)}>{t(`photos.${option}`)}</button>)}
        </div>
        <span className="hint mono">{destination ? `${destination}\\${dateFolder(days[0]?.day ?? '2026-01-01', granularity)}` : dateFolder(days[0]?.day ?? '2026-01-01', granularity)}</span>
      </div>
      <div className="segmented">
        <button type="button" className={mode === 'move' ? 'on' : ''} onClick={() => setMode('move')}>{t('photos.moveVerb')}</button>
        <button type="button" className={mode === 'copy' ? 'on' : ''} onClick={() => setMode('copy')}>{t('photos.copyVerb')}</button>
      </div>
      {mode === 'copy' ? <div className="warn-box">{t('photos.copySpace', { size: formatBytes(bytes, language) })}</div> : <span className="hint">{t('photos.moveHint')}</span>}
      {lowConfidence > 0 && <div className="warn-box">{t('photos.lowConfidence', { count: lowConfidence })}</div>}
    </Dialog>
  )
}
