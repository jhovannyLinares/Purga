import { useContext } from 'react'
import { HELP, type HelpTopic } from '@shared/help'
import { useBackend } from './data'
import { Dialog } from './Dialog'
import { LanguageContext, useText } from './text'

/** Cuántas líneas del registro muestra la Ayuda. */
const LOG_LINES = 200

/** Ayuda (F1): guía, lo que conviene saber, notas de la versión y registro. */
export function HelpDialog({ topic, logFile, onClose }: { topic: HelpTopic; logFile: string; onClose: () => void }) {
  const t = useText()
  const language = useContext(LanguageContext)
  const title = t(topic === 'guide' ? 'menu.guide' : topic === 'goodToKnow' ? 'menu.goodToKnow' : topic === 'releaseNotes' ? 'menu.releaseNotes' : 'menu.log')
  const footer = (
    <>
      {topic === 'log' && <button className="btn" type="button" onClick={() => void window.purga.openPath(logFile)}>{t('about.open')}</button>}
      <span className="grow" />
      <button className="btn primary" type="button" onClick={onClose}>{t('common.close')}</button>
    </>
  )
  return (
    <Dialog title={title} wide footer={footer} onClose={onClose}>
      {topic === 'log' ? <LogLines logFile={logFile} /> : (
        <div className="help-body">
          {HELP[topic][language].map((section) => (
            <div key={section.title}>
              <b className="strong">{section.title}</b>
              <span>{section.text}</span>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  )
}

function LogLines({ logFile }: { logFile: string }) {
  const t = useText()
  const { data } = useBackend('log:tail', { lines: LOG_LINES })
  return (
    <>
      <span className="hint mono break-all">{logFile}</span>
      <div className="value-box log-view">{data && data.length ? data.join('\n') : t('help.emptyLog')}</div>
    </>
  )
}
