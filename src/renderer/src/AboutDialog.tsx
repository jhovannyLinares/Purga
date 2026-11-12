import { useEffect, useState } from 'react'
import type { AboutInfo } from '@shared/ipc-contracts'
import { errorText } from './api'
import { Dialog } from './Dialog'
import { useText } from './text'

/** Acerca de (lámina 8): identidad, con qué corre, de qué depende y dónde guarda. Los datos los da main al abrirlo. */
export function AboutDialog({ logo, onClose }: { logo: string; onClose: () => void }) {
  const t = useText()
  const [info, setInfo] = useState<AboutInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    window.purga.about().then(setInfo, (failure: unknown) => setError(errorText(failure)))
  }, [])

  const footer = (
    <button className="btn primary" type="button" onClick={onClose}>
      {t('common.close')}
    </button>
  )
  return (
    <Dialog title={t('about.title')} wide footer={footer} onClose={onClose}>
      <div className="about-head">
        <img className="logo" src={logo} alt="" />
        <div>
          <div className="about-name">Purga</div>
          <span className="muted">
            {info?.version ?? ''} · {t('app.tagline')}
          </span>
        </div>
      </div>
      {error && <div className="warn-box">{error}</div>}
      {info && (
        <table className="about-table">
          <tbody>
            <tr><th colSpan={2}>{t('about.runsOn')}</th></tr>
            <tr><td>{t('about.versions')}</td><td className="mono nowrap">{`${info.electron} · ${info.chrome} · ${info.node}`}</td></tr>
            <tr><td>{t('about.windows')}</td><td className="mono">{info.windows}</td></tr>
            <tr><th colSpan={2}>{t('about.dependsOn')}</th></tr>
            <tr>
              <td>{t('about.notifications')}</td>
              <td>
                <span className={info.notifications ? 'badge ok' : 'badge warn'}>
                  {info.notifications ? t('about.enabled') : t('about.disabled')}
                </span>
              </td>
            </tr>
            <tr><th colSpan={2}>{t('about.stores')}</th></tr>
            <PathRow path={info.dataDir} action={t('about.openFolder')} />
            <PathRow path={info.logFile} action={t('about.open')} />
          </tbody>
        </table>
      )}
      <span className="hint">{t('about.footer')}</span>
    </Dialog>
  )
}

function PathRow({ path, action }: { path: string; action: string }) {
  return (
    <tr>
      <td className="mono break-all">{path}</td>
      <td>
        <button className="btn small" type="button" onClick={() => void window.purga.openPath(path)}>
          {action}
        </button>
      </td>
    </tr>
  )
}
