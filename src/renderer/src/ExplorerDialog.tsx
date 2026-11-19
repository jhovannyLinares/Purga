import { useState } from 'react'
import { useActions } from './actions'
import { call } from './api'
import { Dialog } from './Dialog'
import { todayDay } from './format'
import { useText } from './text'

/** Días de fábrica para «Programar eliminación» desde el Explorador. */
const DEFAULT_DAYS = 30

function dayIn(days: number): string {
  const date = new Date(`${todayDay()}T00:00:00`)
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/**
 * Lo que llega del clic derecho (F-13): un solo diálogo y un solo lote para todos los archivos de la llamada. Los
 * archivos fuera de las carpetas vigiladas entran como sueltos y se siguen por su File ID.
 */
export function ExplorerDialog({ paths, onClose }: { paths: string[]; onClose: () => void }) {
  const t = useText()
  const actions = useActions()
  const [action, setAction] = useState<'deleteOn' | 'review'>('deleteOn')
  const [day, setDay] = useState(dayIn(DEFAULT_DAYS))
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= todayDay()
  const confirm = () => {
    onClose()
    actions.run(async () => {
      const batchId = await call('marks:fromExplorer', { paths, action, dueDate: day })
      return { text: t('toast.marked', { count: paths.length }), undoBatchId: batchId }
    })
  }
  const footer = (
    <>
      <button className="btn" type="button" onClick={onClose}>{t('common.cancel')}</button>
      <button className="btn primary" type="button" disabled={!valid} onClick={confirm}>{t('explorer.confirm', { count: paths.length })}</button>
    </>
  )
  return (
    <Dialog title={t('explorer.title')} footer={footer} onClose={onClose}>
      <div className="review-list">
        {paths.map((path) => <div className="row" key={path}><span className="grow ellipsis" title={path}>{path}</span></div>)}
      </div>
      <div className="segmented">
        <button type="button" className={action === 'deleteOn' ? 'on' : ''} onClick={() => setAction('deleteOn')}>{t('mark.deleteOn')}</button>
        <button type="button" className={action === 'review' ? 'on' : ''} onClick={() => setAction('review')}>{t('mark.review')}</button>
      </div>
      <label className="field">
        <span className="label accent">{t('dialog.date')}</span>
        <input type="date" value={day} min={todayDay()} onChange={(event) => setDay(event.target.value)} style={{ width: 180 }} />
      </label>
      <span className="hint">{t('explorer.hint')}</span>
    </Dialog>
  )
}
