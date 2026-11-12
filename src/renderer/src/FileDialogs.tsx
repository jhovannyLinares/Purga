import { useContext, useState } from 'react'
import type { FileRow, MarkAction } from '@shared/model'
import { Dialog } from './Dialog'
import { formatBytes, todayDay } from './format'
import { PreviewPane } from './PreviewPane'
import { LanguageContext, useText } from './text'

/** Diálogos que actúan sobre uno o varios archivos (F-4, F-6, F-16, F-19, F-20). */

/** Días por defecto al programar: un mes para eliminar, una semana para revisar. */
const DEFAULT_DELETE_IN_DAYS = 30
const DEFAULT_REVIEW_IN_DAYS = 7

function dayIn(days: number): string {
  const date = new Date(`${todayDay()}T00:00:00`)
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export interface MarkChoice {
  action: MarkAction
  dueDate: string | null
  expiresOn: string | null
}

/** «Eliminar el…», «Revisar el…» y «Conservar…» (con vencimiento opcional). */
export function MarkDialog({ action, count, onConfirm, onClose }: { action: 'deleteOn' | 'review' | 'keep'; count: number; onConfirm: (choice: MarkChoice) => void; onClose: () => void }) {
  const t = useText()
  const [day, setDay] = useState(dayIn(action === 'review' ? DEFAULT_REVIEW_IN_DAYS : DEFAULT_DELETE_IN_DAYS))
  const [withExpiry, setWithExpiry] = useState(false)
  const title = t(action === 'keep' ? 'dialog.keepTitle' : action === 'deleteOn' ? 'dialog.deleteOnTitle' : 'dialog.reviewTitle')
  const explanation = t(action === 'keep' ? 'dialog.keepText' : action === 'deleteOn' ? 'dialog.deleteOnText' : 'dialog.reviewText', { count })
  const datePicked = /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= todayDay()
  const confirm = () => {
    if (action === 'keep') onConfirm({ action, dueDate: null, expiresOn: withExpiry ? day : null })
    else onConfirm({ action, dueDate: day, expiresOn: null })
  }
  const footer = (
    <>
      <button className="btn" type="button" onClick={onClose}>{t('common.cancel')}</button>
      <button className="btn primary" type="button" disabled={(action !== 'keep' || withExpiry) && !datePicked} onClick={confirm}>{title}</button>
    </>
  )
  return (
    <Dialog title={title} footer={footer} onClose={onClose}>
      <span>{explanation}</span>
      {action === 'keep' && (
        <label className="row">
          <input type="checkbox" checked={withExpiry} onChange={(event) => setWithExpiry(event.target.checked)} />
          <span>{t('dialog.withExpiry')}</span>
        </label>
      )}
      {(action !== 'keep' || withExpiry) && (
        <label className="field">
          <span className="label accent">{t(action === 'keep' ? 'dialog.expiresOn' : 'dialog.date')}</span>
          <input type="date" value={day} min={todayDay()} onChange={(event) => setDay(event.target.value)} style={{ width: 180 }} />
        </label>
      )}
    </Dialog>
  )
}

/**
 * Confirmación de enviar a la Papelera, con la lista y «Revisar uno por uno». Si hay archivos en un disco sin
 * Papelera, pide escribir cuántos son (F-19).
 */
export function TrashDialog({ files, onConfirm, onClose }: { files: FileRow[]; onConfirm: (fileIds: number[], confirmedPermanent: number | null) => void; onClose: () => void }) {
  const t = useText()
  const language = useContext(LanguageContext)
  const [included, setIncluded] = useState(() => new Set(files.map((file) => file.fileId)))
  const [reviewing, setReviewing] = useState(false)
  const [typed, setTyped] = useState('')
  const kept = files.filter((file) => included.has(file.fileId))
  const permanent = kept.filter((file) => !file.hasRecycleBin)
  const strongOk = permanent.length === 0 || typed.trim() === String(permanent.length)
  const confirm = () => onConfirm(kept.map((file) => file.fileId), permanent.length ? permanent.length : null)
  if (reviewing) {
    return <ReviewDialog files={files} included={included} onToggle={(fileId) => setIncluded(toggle(included, fileId))} onBack={() => setReviewing(false)} confirmLabel={t('dialog.trashCount', { count: kept.length })} onConfirm={strongOk ? confirm : () => setReviewing(false)} onClose={onClose} />
  }
  const footer = (
    <>
      <button className="btn" type="button" onClick={() => setReviewing(true)}>{t('dialog.reviewOneByOne')}</button>
      <span className="grow" />
      <button className="btn" type="button" onClick={onClose}>{t('common.cancel')}</button>
      <button className="btn danger-solid" type="button" disabled={kept.length === 0 || !strongOk} onClick={confirm}>
        {permanent.length ? t('dialog.deletePermanently') : t('dialog.trashCount', { count: kept.length })}
      </button>
    </>
  )
  return (
    <Dialog title={t(permanent.length ? 'dialog.permanentTitle' : 'dialog.trashTitle')} footer={footer} onClose={onClose}>
      <span>{t('dialog.trashText', { count: kept.length })}</span>
      <div className="review-list">
        {files.map((file) => (
          <div className={included.has(file.fileId) ? 'row' : 'row out'} key={file.fileId}>
            <span className="grow ellipsis" title={file.name}>{file.name}</span>
            <span className="muted">{formatBytes(file.sizeBytes, language)}</span>
          </div>
        ))}
      </div>
      {permanent.length > 0 && (
        <>
          <div className="warn-box">{t('dialog.permanentText', { count: permanent.length })}</div>
          <label className="field">
            <span className="label accent">{t('dialog.typeCount', { count: permanent.length })}</span>
            <input value={typed} onChange={(event) => setTyped(event.target.value)} style={{ width: 120 }} aria-label={t('dialog.typeCount', { count: permanent.length })} />
          </label>
        </>
      )}
    </Dialog>
  )
}

function toggle(set: Set<number>, id: number): Set<number> {
  const next = new Set(set)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

interface ReviewProps {
  files: FileRow[]
  included?: Set<number>
  onToggle?: (fileId: number) => void
  onBack?: () => void
  confirmLabel?: string
  onConfirm?: () => void
  onClose: () => void
}

/** Revisar uno por uno con anterior/siguiente; dentro de una confirmación, cada archivo se puede sacar del lote. */
export function ReviewDialog({ files, included, onToggle, onBack, confirmLabel, onConfirm, onClose }: ReviewProps) {
  const t = useText()
  const [index, setIndex] = useState(0)
  const file = files[index]!
  const inBatch = included?.has(file.fileId) ?? true
  const footer = (
    <>
      <button className="btn" type="button" disabled={index === 0} onClick={() => setIndex(index - 1)}>‹ {t('dialog.previous')}</button>
      <button className="btn" type="button" disabled={index === files.length - 1} onClick={() => setIndex(index + 1)}>{t('dialog.next')} ›</button>
      <span className="grow" />
      {onBack && <button className="btn" type="button" onClick={onBack}>{t('common.back')}</button>}
      {onConfirm ? (
        <button className="btn danger-solid" type="button" disabled={included?.size === 0} onClick={onConfirm}>{confirmLabel}</button>
      ) : (
        <button className="btn primary" type="button" onClick={onClose}>{t('common.close')}</button>
      )}
    </>
  )
  return (
    <Dialog title={`${t('dialog.previewTitle')} · ${index + 1} / ${files.length}`} wide footer={footer} onClose={onClose}>
      <div className="row">
        <b className="strong grow ellipsis" title={file.name}>{file.name}</b>
        {onToggle && (
          <button className="btn small" type="button" onClick={() => onToggle(file.fileId)}>
            {inBatch ? t('dialog.removeFromBatch') : t('dialog.backToBatch')}
          </button>
        )}
      </div>
      <PreviewPane file={file} />
    </Dialog>
  )
}

export function TagDialog({ count, known, onConfirm, onClose }: { count: number; known: string[]; onConfirm: (names: string[]) => void; onClose: () => void }) {
  const t = useText()
  const [name, setName] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const names = [...picked, ...(name.trim() ? [name.trim().replace(/^#/, '')] : [])]
  const footer = (
    <>
      <button className="btn" type="button" onClick={onClose}>{t('common.cancel')}</button>
      <button className="btn primary" type="button" disabled={names.length === 0} onClick={() => onConfirm(names)}>{t('dialog.tag')}</button>
    </>
  )
  return (
    <Dialog title={t('dialog.tagTitle', { count })} footer={footer} onClose={onClose}>
      <label className="field">
        <span className="label accent">{t('dialog.newTag')}</span>
        <input value={name} onChange={(event) => setName(event.target.value)} placeholder={t('dialog.newTagHint')} />
      </label>
      {known.length > 0 && (
        <>
          <span className="label">{t('dialog.existingTag')}</span>
          <div className="chips">
            {known.map((tag) => (
              <button type="button" key={tag} className={picked.has(tag) ? 'chip on' : 'chip'} onClick={() => setPicked((current) => (current.has(tag) ? new Set([...current].filter((item) => item !== tag)) : new Set([...current, tag])))}>
                #{tag}
              </button>
            ))}
          </div>
        </>
      )}
    </Dialog>
  )
}
