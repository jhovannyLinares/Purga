import { BrowserWindow } from 'electron'
import { readFileSync } from 'node:fs'
import logoNightPath from '../../resources/logo.png?asset'
import logoDayPath from '../../resources/logo-dia.png?asset'

/**
 * Pantalla de carga de Purga, con el patrón de Nautilus y Pika: el emblema flotando, «PURGA» y el texto de carga.
 * Solo CSS, sin scripts; el logo va embebido como data URL. Los colores son los de tokens.css (--bg, --text-strong,
 * --muted) del tema activo: la pantalla corre antes que la interfaz y no puede leer la hoja.
 */
export type SplashTheme = 'light' | 'dark'

const SPLASH_COLORS: Record<SplashTheme, { background: string; title: string; text: string; logo: string }> = {
  dark: { background: '#161c23', title: '#ffffff', text: '#94a4b4', logo: logoNightPath },
  light: { background: '#f3f6f9', title: '#121a24', text: '#5b6876', logo: logoDayPath }
}

export const splashBackground = (theme: SplashTheme) => SPLASH_COLORS[theme].background

export function splashHtml(loading: string, theme: SplashTheme, logoDataUrl: string): string {
  const colors = SPLASH_COLORS[theme]
  return `<!doctype html><html><head><meta charset="utf-8"><title>Purga</title><style>
html,body{margin:0;height:100%;background:${colors.background};overflow:hidden;font-family:'Open Sans','Segoe UI',Arial,sans-serif;-webkit-user-select:none;user-select:none}
body{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;-webkit-app-region:drag}
.pg-float{animation:pg-float 2.6s ease-in-out infinite}
@keyframes pg-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-7px)}}
h1{margin:0;font-size:30px;font-weight:600;letter-spacing:6px;color:${colors.title}}
p{margin:0;font-size:13px;color:${colors.text}}
</style></head><body>
<img class="pg-float" src="${logoDataUrl}" width="190" height="190" alt="">
<h1>PURGA</h1><p>${loading}</p>
</body></html>`
}

// sin este mínimo el logo parpadea: el renderer de la pantalla de carga y el de la ventana terminan casi a la vez
const SPLASH_MIN_VISIBLE_MS = 1_500

let logoPaintedAt: number | null = null

/**
 * Abre la pantalla de carga: sin marco, encima, sin Node ni preload. Se muestra recién cuando pintó, para que
 * el marco y el logo aparezcan juntos y no un recuadro vacío. Se cierra con `closeWhenSeen`.
 */
export function openSplash(loading: string, theme: SplashTheme): BrowserWindow {
  const win = new BrowserWindow({
    width: 260,
    height: 480,
    frame: false,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    center: true,
    show: false,
    backgroundColor: splashBackground(theme),
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, javascript: false }
  })
  const logo = 'data:image/png;base64,' + readFileSync(SPLASH_COLORS[theme].logo).toString('base64')
  win.once('ready-to-show', () => {
    win.show()
    logoPaintedAt = Date.now()
  })
  void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml(loading, theme, logo))}`)
  return win
}

/** Cierra la pantalla de carga solo cuando el logo ya se vio: si aún no cargó, espera y deja el mínimo visible. */
export function closeWhenSeen(win: BrowserWindow): void {
  if (win.isDestroyed()) return
  if (logoPaintedAt === null) {
    win.once('ready-to-show', () => closeWhenSeen(win))
    return
  }
  const visibleMs = Date.now() - logoPaintedAt
  const remainingMs = Math.max(0, SPLASH_MIN_VISIBLE_MS - visibleMs)
  setTimeout(() => {
    if (!win.isDestroyed()) win.close()
  }, remainingMs)
}
