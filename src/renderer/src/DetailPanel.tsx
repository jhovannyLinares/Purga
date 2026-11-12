import { useContext, useEffect, useState } from 'react'
import type { FileRow } from '@shared/model'
import { useActions } from './actions'
import { call } from './api'
import { useBackend } from './data'
import { activityText, daysSince, folderOf, formatBytes, formatDay, ORIGIN_LABEL, shortEvidence } from './format'
import { PreviewPane } from './PreviewPane'
import { LanguageContext, useText } from './text'
import { MarkBadge } from './ui'

/** Origen en una línea (lámina 12); el enlace completo y la confianza, solo al pedirlo, con Copiar. */
function OriginLine({ file }: { file: FileRow }) {
  const t = useText()
  const language = useContext(LanguageContext)
  const actions = useActions()
  const [expanded, setExpanded] = useState(false)
  useEffect(() => setExpanded(false), [file.fileId])
  const label = t(ORIGIN_LABEL[file.origin])
  const evidence = file.originEvidence
  if (!evidence) return <>{label}</>
  const copy = () => actions.run(async () => {
    await navigator.clipboard.writeText(evidence)
    return { text: t('toast.copied') }
  })
  return (
    <>
      <span className="value-line" title={evidence}>
        <span>{label} · {shortEvidence(evidence)}</span>
        <button className="link-btn" type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{t(expanded ? 'detail.originHide' : 'detail.originFull')}</button>
      </span>
      {expanded && (
        <div className="value-full">
          {evidence} · {file.originConfidence.toLocaleString(language)}
          <div><button className="btn small" type="button" style={{ marginTop: 6 }} onClick={copy}>{t('common.copy')}</button></div>
        </div>
      )}
    </>
  )
}

/** Columna derecha: origen, actividad, marca, etiquetas, nota y acciones del archivo elegido (lámina 4). */
export function DetailPanel({ fileId }: { fileId: number | null }) {
  const t = useText()
  if (fileId === null) {
    return (
      <aside className="detail" aria-label={t('detail.label')}>
        <span className="section-label">{t('detail.label')}</span>
        <span className="hint">{t('detail.empty')}</span>
      </aside>
    )
  }
  return <FileDetail fileId={fileId} />
}

function FileDetail({ fileId }: { fileId: number }) {
  const t = useText()
  const language = useContext(LanguageContext)
  const actions = useActions()
  const { data: file, error } = useBackend('files:get', { fileId })
  const [note, setNote] = useState('')
  useEffect(() => setNote(file?.note ?? ''), [file?.fileId, file?.note])

  if (error) return <aside className="detail"><div className="warn-box">{error}</div></aside>
  if (!file) return <aside className="detail" aria-label={t('detail.label')}><span className="section-label">{t('detail.label')}</span></aside>

  const saveNote = () => {
    if (note === file.note) return
    actions.run(async () => {
      await call('marks:note', { fileId: file.fileId, note })
      return { text: t('toast.noteSaved') }
    })
  }
  const removeTag = (name: string) => actions.run(async () => {
    await call('tags:remove', { fileIds: [file.fileId], name })
    return null
  })
  const markSource = file.markSource === 'folder' ? t('detail.fromFolder') : file.markSource === 'rule' ? t('detail.fromRule') : file.action === 'unreviewed' ? '—' : t('detail.byHand')
  return (
    <aside className="detail" aria-label={t('detail.label')}>
      <div className="detail-head">
        <span className="section-label">{t('detail.label')}</span>
        <span className="detail-name">{file.name}</span>
        <span className="row" style={{ flexWrap: 'wrap', gap: 4 }}><MarkBadge file={file} /></span>
      </div>
      <PreviewPane file={file} small />
      <div className="row">
        <button className="btn small" type="button" onClick={() => actions.review([file])}>{t('detail.bigPreview')}</button>
        <button className="btn small" type="button" onClick={() => void window.purga.revealFile(file.fileId)}>{t('detail.reveal')}</button>
      </div>
      {file.closedReason === 'modified' && <div className="warn-box">{t('detail.changedAfter')}</div>}
      <dl className="kv">
        <dt>{t('detail.folder')}</dt><dd className="break-all">{folderOf(file)}</dd>
        <dt>{t('table.size')}</dt><dd>{formatBytes(file.sizeBytes, language)}</dd>
        <dt>{t('table.origin')}</dt><dd><OriginLine file={file} /></dd>
        <dt>{t('detail.opened')}</dt><dd>{file.openedAt ? t('detail.daysAgo', { days: daysSince(file.openedAt) }) : t('detail.neverOpened')}</dd>
        <dt>{t('detail.modified')}</dt><dd>{t('detail.daysAgo', { days: daysSince(file.modifiedAt) })}</dd>
        <dt>{t('detail.activity')}</dt><dd>{activityText(t, file)}</dd>
        <dt>{t('detail.expires')}</dt><dd>{file.expiresOn ? formatDay(file.expiresOn) : '—'}</dd>
        <dt>{t('table.mark')}</dt><dd>{markSource}</dd>
      </dl>
      <div className="field">
        <span className="label accent">{t('detail.tags')}</span>
        <div className="chips">
          {file.tags.map((tag) => (
            <button type="button" className="chip on" key={tag.name} title={t('detail.removeTag')} onClick={() => removeTag(tag.name)}>#{tag.name} ×</button>
          ))}
          <button type="button" className="chip" onClick={() => actions.tag([file])}>+ {t('detail.tag')}</button>
        </div>
      </div>
      {!file.hasRecycleBin && <div className="warn-box">{t('detail.noRecycleBin')}</div>}
      <label className="field">
        <span className="label accent">{t('detail.note')}</span>
        <textarea rows={3} value={note} placeholder={t('detail.notePlaceholder')} onChange={(event) => setNote(event.target.value)} onBlur={saveNote} />
      </label>
      <div className="detail-actions">
        <button className="btn" type="button" title={t('detail.actKeepHint')} onClick={() => actions.mark([file], 'keep')}>{t('detail.actKeep')}</button>
        <button className="btn" type="button" title={t('detail.actScheduleHint')} onClick={() => actions.mark([file], 'deleteOn')}>{t('detail.actSchedule')}</button>
        <button className="btn danger" type="button" title={t('detail.actTrashHint')} onClick={() => actions.trash([file])}>{t('detail.actTrash')}</button>
      </div>
    </aside>
  )
}
