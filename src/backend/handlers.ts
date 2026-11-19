import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { z } from 'zod'
import { contracts, isChannel, type Channel, type Res, type RpcResult } from '@shared/ipc-contracts'
import { deleteCustomRule, listCustomRules, saveCustomRule, simulateCustomRule } from './custom-rules'
import { today } from './db'
import { duplicateGroups } from './duplicates'
import { emit } from './events'
import { exportMarks, importMarks, readMarksFile } from './exchange'
import { fileRow, filesOfRoot } from './files'
import { applyFolderMark, simulateFolderMark } from './folder-marks'
import { logError, logFile } from './log'
import { ensureIndexed } from './loose'
import { applyMarks, lastUndoableBatch, listBatches, setNote, trashFiles, undoBatch } from './marks'
import { purgaHome } from './paths'
import { organizePhotos, photosOfRoot, preferPhoto, renameOrCopy, similarGroups } from './photos'
import { loadPreferences, savePreferences } from './preferences'
import { addRoot, globalExtensionFilter, listRoots, removeRoot, rootErrors, saveExtensionFilter, setExcludes } from './roots'
import { listProposals, rejectProposals, ruleSettings, saveRuleSetting, simulateRule } from './rules'
import { deleteSavedSearch, listSavedSearches, saveSearch, searchFiles } from './search'
import { currentScanState, db, queueScan, runDailyPassNow, unwatchRoot, watchRoot } from './service'
import { ackNotices } from './scheduler'
import { expiringFiles, scheduledFiles, summary } from './summary'
import { addTags, listTags, removeTag, setRootTags } from './tags'

type Parsed<C extends Channel> = z.infer<(typeof contracts)[C]['req']>
type Handlers = { [C in Channel]: (payload: Parsed<C>) => Promise<Res<C>> | Res<C> }

/** Lo que cambia el índice avisa a la interfaz para que vuelva a pedir lo que muestra. */
function changed<T>(result: T): T {
  emit({ type: 'index:changed' })
  return result
}

/** Deshacer un movimiento devuelve el archivo a su carpeta original, que puede haberse vaciado y borrado. */
function moveBack(from: string, to: string): void {
  // en Windows renameSync reemplaza el destino: un archivo nuevo con el mismo nombre se perdería
  if (existsSync(to)) throw new Error(`Ya existe otro archivo en ${to}`)
  mkdirSync(dirname(to), { recursive: true })
  renameOrCopy(from, to)
}

function readLogTail(lines: number): string[] {
  try {
    return readFileSync(logFile(), 'utf8').trimEnd().split('\n').slice(-lines)
  } catch {
    // todavía no hay registro: nada que mostrar
    return []
  }
}

const handlers: Handlers = {
  'prefs:load': () => loadPreferences(),
  'prefs:save': (preferences) => {
    savePreferences(preferences)
    emit({ type: 'prefs:changed', preferences })
  },
  'paths:info': () => ({ dataDir: purgaHome(), logFile: logFile() }),
  'log:tail': ({ lines }) => readLogTail(lines),

  'roots:list': () => listRoots(db()),
  'roots:add': ({ path }) => {
    const rootId = addRoot(db(), path)
    watchRoot(rootId)
    queueScan(rootId)
    return changed(rootId)
  },
  'roots:remove': ({ rootId }) => {
    unwatchRoot(rootId)
    removeRoot(db(), rootId)
    changed(undefined)
  },
  'roots:scan': ({ rootId }) => queueScan(rootId),
  'roots:scanState': () => currentScanState(),
  'roots:errors': () => rootErrors(db()),
  'roots:setMark': ({ rootId, mark }) => changed(applyFolderMark(db(), rootId, mark)),
  'roots:simulateMark': ({ rootId, mark }) => simulateFolderMark(db(), rootId, mark),
  'roots:setTags': ({ rootId, tags }) => changed(setRootTags(db(), rootId, tags)),
  'roots:setExcludes': ({ rootId, patterns }) => {
    setExcludes(db(), rootId, patterns)
    queueScan(rootId)
  },
  'extensions:get': () => globalExtensionFilter(db()),
  'extensions:save': ({ rootId, filter }) => {
    saveExtensionFilter(db(), rootId, filter)
    queueScan(rootId)
  },

  'summary:get': () => summary(db(), today()),
  'files:ofRoot': ({ rootId }) => filesOfRoot(db(), rootId),
  'files:get': ({ fileId }) => fileRow(db(), fileId),
  'files:search': (filters) => searchFiles(db(), filters, today()),
  'files:scheduled': () => scheduledFiles(db()),
  'files:expiring': () => expiringFiles(db(), today()),

  'marks:apply': async (request) => changed(await applyMarks(db(), request, `Marcar ${request.fileIds.length} como ${request.action}`)),
  'marks:note': ({ fileId, note }) => changed(setNote(db(), fileId, note)),
  'marks:trash': async ({ fileIds, confirmedPermanent }) => changed(await trashFiles(db(), fileIds, `Enviar ${fileIds.length} a la Papelera`, confirmedPermanent)),
  'marks:fromExplorer': async ({ paths, action, dueDate }) => {
    const fileIds = paths.map((path) => ensureIndexed(db(), path))
    return changed(await applyMarks(db(), { fileIds, action, dueDate, expiresOn: null }, `Desde el Explorador: ${paths.length} archivos`))
  },
  'marks:export': async ({ path }) => {
    const data = await exportMarks(db())
    writeFileSync(path, JSON.stringify(data, null, 2), 'utf8')
    return data.files.length
  },
  'marks:import': async ({ path }) => changed(await importMarks(db(), readMarksFile(path))),
  'batches:list': () => listBatches(db()),
  'batches:undo': async ({ batchId }) => {
    const target = batchId ?? lastUndoableBatch(db())
    if (target === null) throw new Error('No hay ningún lote para deshacer.')
    return changed(await undoBatch(db(), target, moveBack, (path) => rmSync(path, { force: true })))
  },

  'proposals:list': () => listProposals(db()),
  'proposals:reject': ({ fileIds }) => changed(rejectProposals(db(), fileIds)),
  'duplicates:list': () => duplicateGroups(db()),
  'rules:list': () => ruleSettings(db()),
  'rules:save': (setting) => changed(saveRuleSetting(db(), setting)),
  'rules:simulate': ({ ruleId, thresholdDays }) => simulateRule(db(), ruleId, thresholdDays, today()),
  'customRules:list': () => listCustomRules(db()),
  'customRules:save': ({ ruleId, enabled, draft }) => changed(saveCustomRule(db(), draft, ruleId, enabled)),
  'customRules:delete': ({ ruleId }) => changed(deleteCustomRule(db(), ruleId)),
  'customRules:simulate': (draft) => simulateCustomRule(db(), draft, today()),

  'photos:similar': () => similarGroups(db()),
  'photos:prefer': ({ groupKey, fileId }) => changed(preferPhoto(db(), groupKey, fileId)),
  'photos:ofRoot': ({ rootId }) => photosOfRoot(db(), rootId),
  'photos:organize': async (request) => changed(await organizePhotos(db(), request, `${request.mode === 'move' ? 'Mover' : 'Copiar'} ${request.fileIds.length} fotos por fecha`)),

  'tags:list': () => listTags(db()),
  'tags:add': ({ fileIds, names }) => changed(addTags(db(), fileIds, names)),
  'tags:remove': ({ fileIds, name }) => changed(removeTag(db(), fileIds, name)),
  'searches:list': () => listSavedSearches(db()),
  'searches:save': ({ name, filters }) => changed(saveSearch(db(), name, filters)),
  'searches:delete': ({ searchId }) => changed(deleteSavedSearch(db(), searchId)),

  'notices:ack': ({ eventIds }) => ackNotices(db(), eventIds),
  'dailyPass:run': () => runDailyPassNow()
}

/** Valida la petición contra su contrato y la responde; el error se registra aquí, una sola vez. */
export async function dispatch(channel: unknown, payload: unknown): Promise<RpcResult> {
  if (!isChannel(channel)) return { ok: false, error: { message: `Canal desconocido: ${String(channel)}` } }
  const parsed = contracts[channel].req.safeParse(payload)
  if (!parsed.success) return { ok: false, error: { message: `Petición inválida para ${channel}: ${parsed.error.message}` } }
  try {
    const handler = handlers[channel] as (payload: unknown) => unknown
    return { ok: true, data: await handler(parsed.data) }
  } catch (error) {
    logError(channel, error)
    return { ok: false, error: { message: error instanceof Error ? error.message : String(error) } }
  }
}
