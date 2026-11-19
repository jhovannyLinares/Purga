import { watch, type FSWatcher } from 'node:fs'
import type { ScanState } from '@shared/ipc-contracts'
import { nowIso, openDatabase, today, type Database } from './db'
import { emit } from './events'
import { logError } from './log'
import { dataFile } from './paths'
import { readRecentOpenings } from './recent'
import { rootIds, rootRecord } from './roots'
import { reconcileRoot } from './scan'
import { dailyPassDue, pendingNotices, runDailyPass } from './scheduler'
import { hashContents } from './duplicates'
import { analyzePhotos } from './photos'
import { evaluateRules } from './rules'

/**
 * Lo que el backend mantiene vivo: el índice abierto, la cola de revisiones (una carpeta a la vez), la vigilancia de
 * cada carpeta y el reloj de la pasada diaria (§5.1).
 */
let database: Database | null = null

export function db(): Database {
  database ??= openDatabase(dataFile('purga.db'))
  return database
}

const scanState: ScanState = { running: false, rootId: null, lastScanAt: null }
const scanQueue: number[] = []

export const currentScanState = (): ScanState => ({ ...scanState })

/** Encola la revisión de una carpeta (o de todas con null); corre por detrás y avisa a la interfaz al terminar. */
export function queueScan(rootId: number | null): void {
  const ids = rootId === null ? rootIds(db()) : [rootId]
  for (const id of ids) if (!scanQueue.includes(id)) scanQueue.push(id)
  void drainScanQueue()
}

async function drainScanQueue(): Promise<void> {
  if (scanState.running) return
  scanState.running = true
  try {
    await drainQueuedRoots()
  } finally {
    // un fallo inesperado no puede dejar «revisando» encendido: ninguna revisión volvería a correr
    Object.assign(scanState, { running: false, rootId: null, lastScanAt: nowIso() })
    emit({ type: 'scan:state', state: currentScanState() })
  }
}

async function drainQueuedRoots(): Promise<void> {
  const openings = readRecentOpenings()
  while (scanQueue.length > 0) {
    const rootId = scanQueue.shift()!
    scanState.rootId = rootId
    emit({ type: 'scan:state', state: currentScanState() })
    try {
      await reconcileRoot(db(), rootId, openings)
    } catch (error) {
      logError('reconcile', error, `carpeta ${rootId}`)
    }
    emit({ type: 'index:changed' })
  }
  await refreshProposals()
}

/** Después de cada revisión: duplicados, fotos y propuestas al día, sin esperar la pasada diaria. No borra nada. */
async function refreshProposals(): Promise<void> {
  try {
    await hashContents(db())
    await analyzePhotos(db())
    evaluateRules(db(), today())
  } catch (error) {
    logError('proposals.refresh', error)
  }
  emit({ type: 'index:changed' })
}

/** Los cambios llegan en ráfagas (copiar una carpeta son cientos de avisos): se espera a que se calmen. */
const WATCH_SETTLE_MS = 1_500
const watchers = new Map<number, FSWatcher>()

/** Vigilancia con `fs.watch` recursivo, que en Windows es ReadDirectoryChangesW (F-1). */
export function watchRoot(rootId: number): void {
  if (watchers.has(rootId)) return
  const { path } = rootRecord(db(), rootId)
  let timer: NodeJS.Timeout | null = null
  try {
    const watcher = watch(path, { recursive: true }, () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => queueScan(rootId), WATCH_SETTLE_MS)
    })
    watcher.on('error', (error) => {
      logError('watch', error, path)
      unwatchRoot(rootId)
    })
    watchers.set(rootId, watcher)
  } catch (error) {
    // carpeta en un disco desconectado: se vigila cuando vuelva, en la próxima revisión completa
    logError('watch.start', error, path)
  }
}

export function unwatchRoot(rootId: number): void {
  watchers.get(rootId)?.close()
  watchers.delete(rootId)
}

/** Cada cuánto se mira si toca la pasada diaria con la app abierta o en la bandeja. */
const DAILY_CHECK_MS = 60 * 60 * 1000
let dailyRunning = false

export async function runDailyPassNow(): Promise<void> {
  if (dailyRunning) return
  dailyRunning = true
  try {
    await runDailyPass(db(), today())
    emit({ type: 'index:changed' })
  } catch (error) {
    logError('dailyPass', error)
  } finally {
    dailyRunning = false
    deliverNotices()
  }
}

export function deliverNotices(): void {
  const pending = pendingNotices(db())
  if (pending.length > 0) emit({ type: 'notices', pending })
}

/** §5.1: revisar todo por detrás, vigilar, y pasada diaria si pasaron 24 horas. */
export function start(): void {
  for (const rootId of rootIds(db())) watchRoot(rootId)
  queueScan(null)
  const checkDaily = () => {
    if (dailyPassDue(db(), nowIso())) void runDailyPassNow()
    else deliverNotices()
  }
  checkDaily()
  setInterval(checkDaily, DAILY_CHECK_MS)
}
