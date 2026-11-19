import { useContext, useEffect, useState } from 'react'
import type { FileRow } from '@shared/model'
import type { Preview } from '@shared/preview'
import { errorText } from './api'
import { formatBytes } from './format'
import { LanguageContext, useText } from './text'

/** Vista previa de un archivo (F-20): lo que Windows o Chromium muestran sin abrir la app del archivo; «Abrir» usa la app de Windows. */
export function PreviewPane({ file, small }: { file: FileRow; small?: boolean }) {
  const t = useText()
  const language = useContext(LanguageContext)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let current = true
    setPreview(null)
    window.purga.preview(file.fileId).then((result) => current && setPreview(result), (failure: unknown) => current && setError(errorText(failure)))
    return () => {
      current = false
    }
  }, [file.fileId])

  const caption = (text: string) => <div className="cap">{text}</div>
  const openWith = (
    <button className="btn small" type="button" onClick={() => void window.purga.openFileWith(file.fileId)}>
      {t('file.open')}
    </button>
  )
  let body
  if (error) body = <div className="none"><span>{error}</span></div>
  else if (!preview) body = <div className="none"><span>{t('preview.loading')}</span></div>
  else if (preview.kind === 'image' || preview.kind === 'thumbnail') {
    body = (
      <>
        <div className="image"><img src={preview.dataUrl} alt={file.name} /></div>
        {caption(t(preview.kind === 'image' ? 'preview.image' : 'preview.thumbnail'))}
      </>
    )
  } else if (preview.kind === 'pdf') {
    body = (
      <>
        {preview.thumbnail ? <div className="image"><img src={preview.thumbnail} alt={file.name} /></div> : <div className="none"><b className="strong">PDF</b></div>}
        <div className="cap row">
          <span className="grow">{t('preview.pdf')}</span>
          <button className="btn small" type="button" onClick={() => void window.purga.openFileWith(file.fileId)}>{t('file.open')}</button>
        </div>
      </>
    )
  } else if (preview.kind === 'text') {
    body = (
      <>
        <pre>{preview.lines.join('\n')}{preview.truncated ? '\n…' : ''}</pre>
        {caption(t('preview.text'))}
      </>
    )
  } else if (preview.kind === 'archive') {
    body = (
      <>
        <pre>{preview.entries.map((entry) => `${entry.name}  ${formatBytes(entry.size, language)}`).join('\n')}{preview.total > preview.entries.length ? `\n… ${preview.total}` : ''}</pre>
        {caption(t('preview.archive', { count: preview.total }))}
      </>
    )
  } else if (preview.kind === 'executable') {
    body = (
      <>
        <div className="none">
          <b className="strong">{preview.product || file.name}</b>
          <span>{[preview.company, preview.version, preview.signature].filter(Boolean).join(' · ')}</span>
        </div>
        {caption(t('preview.executable'))}
      </>
    )
  } else if (preview.kind === 'missing') body = <div className="none"><span>{t('preview.missing')}</span></div>
  else body = <div className="none"><span>{t('preview.none', { extension: file.extension || '—' })}</span>{openWith}</div>
  return <div className={small ? 'preview small' : 'preview'}>{body}</div>
}
