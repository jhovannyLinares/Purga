import type { Root } from '@shared/model'
import { Dialog } from './Dialog'
import { useText } from './text'

/** Confirmación de «Dejar de vigilar»: dice antes de hacerlo que no se borra nada del disco y qué sale del índice. */
export function UnwatchDialog({ root, onClose, onConfirm }: { root: Root; onClose: () => void; onConfirm: () => void }) {
  const t = useText()
  const footer = (
    <>
      <button className="btn" type="button" onClick={onClose}>{t('common.cancel')}</button>
      <button className="btn danger" type="button" onClick={onConfirm}>{t('explore.stopWatching')}</button>
    </>
  )
  return (
    <Dialog title={t('roots.unwatchTitle', { name: root.name })} footer={footer} onClose={onClose}>
      <span className="break-all muted">{root.path}</span>
      <span>{t('roots.unwatchBody')}</span>
      <span className="hint">{t('roots.unwatchAgain')}</span>
    </Dialog>
  )
}
