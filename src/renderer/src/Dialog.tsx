import { useEffect, type ReactNode } from 'react'
import { useText } from './text'

interface DialogProps {
  title: string
  wide?: boolean
  footer: ReactNode
  onClose: () => void
  children: ReactNode
}

/** Diálogo de la familia: se cierra con la ×, con Escape o con un clic fuera. */
export function Dialog({ title, wide, footer, onClose, children }: DialogProps) {
  const t = useText()
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [onClose])
  return (
    // detail > 1: es el segundo clic del doble clic que abrió el diálogo, no un clic fuera para cerrarlo
    <div className="backdrop" onClick={(event) => event.target === event.currentTarget && event.detail <= 1 && onClose()}>
      <div className={wide ? 'dialog wide' : 'dialog'} role="dialog" aria-label={title}>
        <div className="dialog-head">
          <span className="dialog-title">{title}</span>
          <button type="button" className="dialog-x" aria-label={t('common.close')} onClick={onClose}>
            ×
          </button>
        </div>
        <div className="dialog-body">{children}</div>
        <div className="dialog-foot">{footer}</div>
      </div>
    </div>
  )
}
