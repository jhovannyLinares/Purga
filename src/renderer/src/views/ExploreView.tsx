import { useContext, useEffect, useState } from 'react'
import type { FolderMark, Root } from '@shared/model'
import type { Simulation } from '@shared/rules'
import { useActions } from '../actions'
import { call, errorText } from '../api'
import { useBackend } from '../data'
import { Dialog } from '../Dialog'
import { FileTable } from '../FileTable'
import { formatBytes, formatCount } from '../format'
import { LanguageContext, useText, type Translate } from '../text'
import { Empty, ListHead } from '../ui'
import type { ViewProps } from './view-props'

/** Días de fábrica al elegir una marca de carpeta con días. */
const DEFAULT_FOLDER_DAYS = 30

export function folderMarkText(t: Translate, mark: FolderMark): string {
  switch (mark.kind) {
    case 'inherit':
      return t('folderMark.inherit')
    case 'keepAll':
      return t('folderMark.keepAll')
    case 'deleteOlderThan':
      return t('folderMark.deleteOlderThan', { days: mark.days })
    case 'reviewEvery':
      return t('folderMark.reviewEvery', { days: mark.days })
    case 'photosByDate':
      return t('folderMark.photosByDate')
  }
}

/** Explorar una carpeta vigilada (lámina 4): sus archivos con casillas y la marca de la carpeta. */
export function ExploreView({ root, detailId, onDetail, logo }: ViewProps & { root: Root | null; logo: string }) {
  const t = useText()
  const [editing, setEditing] = useState(false)
  const { data: files } = useBackend('files:ofRoot', { rootId: root?.rootId ?? 0 })
  if (!root) return <Empty logo={logo} title={t('explore.pickTitle')} text={t('explore.pickText')} />
  return (
    <>
      <ListHead title={root.name} sub={root.path}>
        <span className="hint ellipsis" title={folderMarkText(t, root.folderMark)}>{t('explore.folderMark')} <b className="strong">{folderMarkText(t, root.folderMark)}</b></span>
        <button className="btn small" type="button" onClick={() => setEditing(true)}>{t('explore.change')}</button>
      </ListHead>
      {!root.online && <div className="notice warn">{t('explore.offline')}</div>}
      {files && files.length === 0 ? (
        <Empty title={t('explore.emptyTitle')} text={t('explore.emptyText')} />
      ) : (
        <FileTable tableId="explore" title={t('nav.explore')} files={files ?? []} detailId={detailId} onDetail={onDetail} hint={t('explore.hint')} />
      )}
      {editing && <FolderMarkDialog root={root} onClose={() => setEditing(false)} />}
    </>
  )
}

type MarkKind = FolderMark['kind']

/** Marca de carpeta con su simulación antes de guardar (F-5), sus etiquetas (F-16) y dejar de vigilar. */
function FolderMarkDialog({ root, onClose }: { root: Root; onClose: () => void }) {
  const t = useText()
  const language = useContext(LanguageContext)
  const actions = useActions()
  const [kind, setKind] = useState<MarkKind>(root.folderMark.kind)
  const [days, setDays] = useState('days' in root.folderMark ? root.folderMark.days : DEFAULT_FOLDER_DAYS)
  const [destination, setDestination] = useState(root.folderMark.kind === 'photosByDate' ? root.folderMark.destination : '')
  const [tags, setTags] = useState(root.tags.join(', '))
  const [excludes, setExcludes] = useState(root.excludes.join(', '))
  const [simulation, setSimulation] = useState<Simulation | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mark: FolderMark | null = (() => {
    if (kind === 'deleteOlderThan' || kind === 'reviewEvery') return days > 0 ? { kind, days } : null
    if (kind === 'photosByDate') return destination ? { kind, destination } : null
    return { kind }
  })()

  useEffect(() => {
    setSimulation(null)
    if (!mark) return
    call('roots:simulateMark', { rootId: root.rootId, mark }).then(setSimulation, (failure: unknown) => setError(errorText(failure)))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- la marca se compara por su JSON
  }, [JSON.stringify(mark)])

  const save = () => {
    if (!mark) return
    onClose()
    actions.run(async () => {
      await call('roots:setMark', { rootId: root.rootId, mark })
      await call('roots:setTags', { rootId: root.rootId, tags: tags.split(',').map((tag) => tag.trim().replace(/^#/, '')).filter(Boolean) })
      await call('roots:setExcludes', { rootId: root.rootId, patterns: excludes.split(',') })
      return { text: t('toast.folderMarkSaved') }
    })
  }
  const stopWatching = () => {
    onClose()
    actions.unwatch(root)
  }
  const pickDestination = async () => {
    const folder = await window.purga.pickFolder()
    if (folder) setDestination(folder)
  }
  const options: MarkKind[] = ['inherit', 'keepAll', 'deleteOlderThan', 'reviewEvery', 'photosByDate']
  const footer = (
    <>
      <button className="btn danger" type="button" onClick={stopWatching}>{t('explore.stopWatching')}</button>
      <span className="grow" />
      <button className="btn" type="button" onClick={onClose}>{t('common.cancel')}</button>
      <button className="btn primary" type="button" disabled={!mark} onClick={save}>{t('common.save')}</button>
    </>
  )
  return (
    <Dialog title={t('explore.markTitle', { name: root.name })} footer={footer} onClose={onClose}>
      <span>{t('explore.markText')}</span>
      <label className="field">
        <span className="label accent">{t('table.mark')}</span>
        <select value={kind} onChange={(event) => setKind(event.target.value as MarkKind)}>
          {options.map((option) => <option key={option} value={option}>{folderMarkText(t, option === 'deleteOlderThan' || option === 'reviewEvery' ? { kind: option, days } : option === 'photosByDate' ? { kind: option, destination } : { kind: option })}</option>)}
        </select>
      </label>
      {(kind === 'deleteOlderThan' || kind === 'reviewEvery') && (
        <label className="field">
          <span className="label accent">{t('explore.days')}</span>
          <input type="number" min={1} value={days} onChange={(event) => setDays(Number(event.target.value))} style={{ width: 120 }} />
        </label>
      )}
      {kind === 'photosByDate' && (
        <div className="field">
          <span className="label accent">{t('photos.destination')}</span>
          <div className="row"><input className="grow mono" value={destination} onChange={(event) => setDestination(event.target.value)} /><button className="btn" type="button" onClick={() => void pickDestination()}>{t('common.choose')}</button></div>
          <span className="hint">{t('photos.autoHint')}</span>
        </div>
      )}
      <label className="field">
        <span className="label accent">{t('explore.folderTags')}</span>
        <input value={tags} onChange={(event) => setTags(event.target.value)} placeholder={t('explore.folderTagsHint')} />
      </label>
      <label className="field">
        <span className="label accent">{t('explore.excludes')}</span>
        <input value={excludes} onChange={(event) => setExcludes(event.target.value)} placeholder={t('explore.excludesHint')} />
      </label>
      {simulation && <span className="hint">{t(kind === 'photosByDate' ? 'explore.simulationPhotos' : 'explore.simulation', { count: formatCount(simulation.files, language), size: formatBytes(simulation.bytes, language) })}</span>}
      {error && <div className="warn-box">{error}</div>}
    </Dialog>
  )
}
