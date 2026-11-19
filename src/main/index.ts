import { app, BrowserWindow, dialog, ipcMain, Menu, Notification, shell, Tray, nativeImage } from 'electron'
import { existsSync, statSync } from 'node:fs'
import { release } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { resolveLanguage, translate, type Language, type TextKey } from '@shared/i18n'
import { contracts, isChannel, type AboutInfo, type AppEvent, type RpcResult } from '@shared/ipc-contracts'
import { runsWhenOpened } from '@shared/file-open'
import type { FileRow } from '@shared/model'
import type { Preferences } from '@shared/preferences'
import logoPath from '../../resources/logo.png?asset'
import { BackendClient } from './backend-client'
import { registerExplorerVerb, scheduledPaths } from './explorer-verb'
import { showNotices } from './notifier'
import { previewFile } from './preview'
import { closeWhenSeen, openSplash, splashBackground } from './splash'
import { readStartupPreferences, startupLoadingText, startupTheme } from './startup-preferences'

/** Ventana principal, bandeja y Windows. El índice, el disco y la Papelera van en el backend (utilityProcess). */

const isDev = !app.isPackaged && !!process.env.ELECTRON_RENDERER_URL
const CSP = isDev
  ? "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' ws: http://localhost:*"
  : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'"

/** Ventana de la maqueta (lámina 4): 1280×800, mínimo 1100×700. */
const WINDOW_SIZE = { width: 1280, height: 800, minWidth: 1100, minHeight: 700 }
/** Si la interfaz nunca avisa que cargó (un error al arrancar), la pantalla de carga se cierra igual. */
const SPLASH_TIMEOUT_MS = 20_000
/** Las llamadas del clic derecho que llegan juntas (varios archivos seleccionados) forman un solo lote (F-13). */
const EXPLORER_GATHER_MS = 300
/** Arrancado por Windows al iniciar sesión: queda en la bandeja, sin ventana. */
const HIDDEN_ARG = '--hidden'

let mainWindow: BrowserWindow | null = null
let splash: BrowserWindow | null = null
let tray: Tray | null = null
let quitting = false
let preferences: Preferences = readStartupPreferences()
const language = (): Language => resolveLanguage(preferences.language, app.getLocale())
const t = (key: TextKey) => translate(language(), key)

function closeSplash(): void {
  if (splash) closeWhenSeen(splash)
  splash = null
}

function onBackendEvent(event: AppEvent): void {
  if (event.type === 'prefs:changed') applyPreferences(event.preferences)
  if (event.type === 'notices') {
    const shown = showNotices(language(), event.pending, showWindow)
    if (shown.length) void backend.call('notices:ack', { eventIds: shown })
    return
  }
  mainWindow?.webContents.send('app-event', event)
}
const backend = new BackendClient(onBackendEvent, (code) => console.error(`El backend terminó (código ${code}); se reinicia.`))

function applyPreferences(next: Preferences): void {
  preferences = next
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: next.startWithWindows, args: [HIDDEN_ARG] })
  rebuildTrayMenu()
}

async function fileOf(fileId: unknown): Promise<FileRow | null> {
  if (typeof fileId !== 'number') return null
  const result = await backend.call('files:get', { fileId })
  return result.ok ? (result.data as FileRow) : null
}

async function appPaths(): Promise<{ dataDir: string; logFile: string }> {
  const paths = await backend.call('paths:info', undefined)
  if (!paths.ok) throw new Error(paths.error.message)
  return paths.data as { dataDir: string; logFile: string }
}

async function aboutInfo(): Promise<AboutInfo> {
  const { dataDir, logFile } = await appPaths()
  return {
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    windows: release(),
    notifications: Notification.isSupported(),
    dataDir,
    logFile
  }
}

const JSON_FILTER = [{ name: 'JSON', extensions: ['json'] }]

/**
 * Rutas que main entregó a la interfaz: las elegidas en un diálogo y las que llegaron del clic derecho. Escribir o
 * leer un archivo de marcas, o marcar desde el Explorador, solo se acepta con una de ellas: así una interfaz
 * comprometida no puede pisar ni leer cualquier archivo del disco.
 */
const pathsFromDialogs = new Set<string>()
const pathsFromExplorer = new Set<string>()

function remember(path: string | null): string | null {
  if (path) pathsFromDialogs.add(path)
  return path
}

function pathsAreOurs(channel: string, payload: unknown): boolean {
  if (channel === 'marks:export' || channel === 'marks:import') return pathsFromDialogs.has((payload as { path: string }).path)
  if (channel === 'marks:fromExplorer') return (payload as { paths: string[] }).paths.every((path) => pathsFromExplorer.has(path))
  return true
}

function registerIpc(): void {
  ipcMain.handle('rpc', async (_event, request: { channel: unknown; payload: unknown }): Promise<RpcResult> => {
    if (!isChannel(request?.channel)) return { ok: false, error: { message: 'Canal desconocido.' } }
    const parsed = contracts[request.channel].req.safeParse(request.payload)
    if (!parsed.success) return { ok: false, error: { message: `Petición inválida: ${parsed.error.message}` } }
    if (!pathsAreOurs(request.channel, parsed.data)) return { ok: false, error: { message: 'Ruta no elegida en un diálogo de Purga.' } }
    return backend.call(request.channel, parsed.data)
  })
  ipcMain.handle('app:about', () => aboutInfo())
  // la interfaz terminó de cargar: se cierra la pantalla de carga y se atiende lo que llegó del clic derecho
  ipcMain.handle('app:ready', () => {
    closeSplash()
    flushExplorerPaths()
  })
  ipcMain.handle('app:quit', () => quit())
  ipcMain.handle('app:hide', () => mainWindow?.hide())
  ipcMain.handle('dialog:folder', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] })
    return remember(result.canceled ? null : (result.filePaths[0] ?? null))
  })
  ipcMain.handle('dialog:saveJson', async (_event, defaultName: unknown) => {
    if (!mainWindow) return null
    const result = await dialog.showSaveDialog(mainWindow, { defaultPath: typeof defaultName === 'string' ? defaultName : undefined, filters: JSON_FILTER })
    return remember(result.canceled ? null : (result.filePath ?? null))
  })
  ipcMain.handle('dialog:openJson', async () => {
    if (!mainWindow) return null
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters: JSON_FILTER })
    return remember(result.canceled ? null : (result.filePaths[0] ?? null))
  })
  // solo la carpeta de datos o el registro: openPath ejecuta lo que abre, y la ruta llega de la interfaz
  ipcMain.handle('shell:open', async (_event, path: unknown) => {
    const { dataDir, logFile } = await appPaths()
    if ((path !== dataDir && path !== logFile) || !existsSync(path)) return false
    return (await shell.openPath(path)) === ''
  })
  // de un archivo del índice se pide por su id, nunca por una ruta que mande la interfaz
  ipcMain.handle('file:reveal', async (_event, fileId: unknown) => {
    const file = await fileOf(fileId)
    if (!file || !existsSync(file.path)) return false
    shell.showItemInFolder(file.path)
    return true
  })
  // con el programa predeterminado de Windows; un ejecutable no se abre: abrirlo lo correría
  ipcMain.handle('file:openWith', async (_event, fileId: unknown) => {
    const file = await fileOf(fileId)
    if (!file || runsWhenOpened(file.name) || !existsSync(file.path)) return false
    return (await shell.openPath(file.path)) === ''
  })
  ipcMain.handle('file:preview', async (_event, fileId: unknown) => {
    const file = await fileOf(fileId)
    return file ? previewFile(file.path) : { kind: 'missing' }
  })
  // una carpeta del Resumen: solo si está dentro de una carpeta vigilada; abrir una carpeta no ejecuta nada
  ipcMain.handle('folder:open', async (_event, folder: unknown) => {
    if (typeof folder !== 'string' || !(await insideWatchedRoot(folder))) return false
    if (!existsSync(folder) || !statSync(folder).isDirectory()) return false
    return (await shell.openPath(folder)) === ''
  })
}

async function insideWatchedRoot(folder: string): Promise<boolean> {
  const roots = await backend.call('roots:list', undefined)
  if (!roots.ok) return false
  const target = resolve(folder).toLowerCase()
  return (roots.data as { path: string }[]).some((root) => {
    const base = resolve(root.path).toLowerCase()
    return target === base || target.startsWith(base.endsWith(sep) ? base : base + sep)
  })
}

function createWindow(backgroundColor: string, visible: boolean): void {
  mainWindow = new BrowserWindow({
    ...WINDOW_SIZE,
    backgroundColor,
    title: 'Purga',
    icon: logoPath,
    show: false,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: true, contextIsolation: true, devTools: isDev }
  })
  // la interfaz no usa cámara, micrófono, notificaciones web ni nada que pida permiso: se niega todo
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
  mainWindow.webContents.session.setPermissionCheckHandler(() => false)
  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) =>
    callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': [CSP] } })
  )
  // sin navegación: la interfaz es una sola página
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault())
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  if (isDev) void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL!)
  else void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  if (visible) mainWindow.once('ready-to-show', () => mainWindow?.show())
  // F-14: al cerrar queda en la bandeja para la pasada diaria y los avisos
  mainWindow.on('close', (event) => {
    if (quitting || !preferences.keepInTray) return
    event.preventDefault()
    mainWindow?.hide()
  })
  mainWindow.on('closed', () => (mainWindow = null))
}

function showWindow(): void {
  if (!mainWindow) return
  if (mainWindow.isMinimized()) mainWindow.restore()
  mainWindow.show()
  mainWindow.focus()
}

/** Si después de esto el proceso sigue vivo, se fuerza la salida: el instalador no puede reemplazar una app abierta. */
const QUIT_GRACE_MS = 5_000

/**
 * Identidad de la app en Windows (el `appId` de electron-builder.yml). Desarrollo y pruebas usan otra: para notificar,
 * Electron crea un «Electron.lnk» en el menú Inicio con esta identidad, y si fuera la misma Windows le tomaría el ícono
 * (el átomo) a la Purga instalada en la barra de tareas.
 */
const APP_USER_MODEL_ID = 'com.jhovanny.purga'

/**
 * «Salir» no depende de que cada ventana acepte cerrarse: se destruyen (sin pasar por el «close» que esconde en la
 * bandeja) y se quita el ícono. Con un perfil limpio app.quit basta; en la instancia del usuario quedó viva.
 */
function quit(): void {
  quitting = true
  backend.stop()
  tray?.destroy()
  tray = null
  for (const window of BrowserWindow.getAllWindows()) window.destroy()
  setTimeout(() => {
    console.warn(`Purga seguía abierta ${QUIT_GRACE_MS} ms después de Salir; se fuerza la salida.`)
    app.exit(0)
  }, QUIT_GRACE_MS).unref()
  app.quit()
}

function rebuildTrayMenu(): void {
  tray?.setContextMenu(Menu.buildFromTemplate([
    { label: t('tray.open'), click: showWindow },
    { label: t('menu.scan'), click: () => void backend.call('roots:scan', { rootId: null }) },
    { type: 'separator' },
    { label: t('menu.quit'), click: quit }
  ]))
}

function createTray(): void {
  tray = new Tray(nativeImage.createFromPath(logoPath).resize({ width: 16, height: 16 }))
  tray.setToolTip('Purga')
  tray.on('click', showWindow)
  rebuildTrayMenu()
}

// ---------- clic derecho del Explorador (F-13) ----------
let explorerPaths: string[] = []
let explorerTimer: NodeJS.Timeout | null = null
let interfaceReady = false

function gatherExplorerPaths(paths: string[]): void {
  if (paths.length === 0) return
  explorerPaths.push(...paths)
  if (explorerTimer) clearTimeout(explorerTimer)
  explorerTimer = setTimeout(flushExplorerPaths, EXPLORER_GATHER_MS)
}

function flushExplorerPaths(): void {
  interfaceReady = true
  if (!mainWindow || explorerPaths.length === 0) return
  const paths = [...new Set(explorerPaths)]
  explorerPaths = []
  for (const path of paths) pathsFromExplorer.add(path)
  showWindow()
  mainWindow.webContents.send('explorer-request', paths)
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    const paths = scheduledPaths(argv)
    if (paths.length === 0) showWindow()
    else if (interfaceReady) gatherExplorerPaths(paths)
    else explorerPaths.push(...paths)
  })

  void app.whenReady().then(() => {
    Menu.setApplicationMenu(null)
    app.setAppUserModelId(app.isPackaged ? APP_USER_MODEL_ID : `${APP_USER_MODEL_ID}.dev`)
    const hidden = process.argv.includes(HIDDEN_ARG)
    const theme = startupTheme(preferences)
    if (!hidden) {
      const loadingWindow = openSplash(startupLoadingText(preferences), theme)
      splash = loadingWindow
      setTimeout(() => {
        if (!loadingWindow.isDestroyed()) loadingWindow.close()
      }, SPLASH_TIMEOUT_MS)
    }
    explorerPaths.push(...scheduledPaths(process.argv))
    // PURGA_NOW adelanta el reloj para las pruebas; instalada, una variable olvidada vencería todo lo programado
    if (app.isPackaged) delete process.env['PURGA_NOW']
    backend.start()
    registerIpc()
    createWindow(splashBackground(theme), !hidden)
    createTray()
    applyPreferences(preferences)
    registerExplorerVerb(t('explorer.verb')).catch((error: unknown) => console.error('No se pudo registrar el clic derecho:', error))
  })
}

app.on('before-quit', () => {
  quitting = true
  backend.stop()
})
app.on('window-all-closed', () => {
  if (!preferences.keepInTray) quit()
})
