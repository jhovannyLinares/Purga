import { z } from 'zod'
import { SavedSearchSchema, SearchFiltersSchema } from './filters'
import { CustomRuleDraftSchema, CustomRuleSchema } from './custom-rules'
import { BatchSchema, DaySchema, ExtensionFilterSchema, FileRowSchema, FolderMarkSchema, MarkActionSchema, MarkRequestSchema, RootSchema, TrashResultSchema } from './model'
import { PendingNoticeSchema } from './notices'
import { OrganizeRequestSchema, OrganizeResultSchema, PhotoInfoSchema, SimilarGroupSchema } from './photos'
import { PreferencesSchema } from './preferences'
import { ProposalSchema, RuleSettingSchema, RULE_IDS, SimulationSchema } from './rules'

/**
 * Contrato IPC único entre la interfaz y el backend: cada canal define su petición y su respuesta.
 * Main valida la petición antes de reenviarla y el backend la valida otra vez (mismo patrón que Pika).
 */

export const AboutInfoSchema = z.object({
  version: z.string(),
  electron: z.string(),
  chrome: z.string(),
  node: z.string(),
  windows: z.string(),
  notifications: z.boolean(),
  dataDir: z.string(),
  logFile: z.string()
})

const FileIds = z.object({ fileIds: z.array(z.number()).min(1) })
const RootRef = z.object({ rootId: z.number() })
const Path = z.object({ path: z.string().min(1) })

export const SummarySchema = z.object({
  roots: z.number(),
  files: z.number(),
  bytes: z.number(),
  proposals: z.number(),
  proposalBytes: z.number(),
  scheduled: z.number(),
  scheduledBytes: z.number(),
  duplicateGroups: z.number(),
  expiring: z.number(),
  unreviewed: z.number(),
  byOrigin: z.array(z.object({ origin: z.string(), bytes: z.number() })),
  staleFolders: z.array(z.object({ folder: z.string(), bytes: z.number() })),
  nextScheduled: z.array(FileRowSchema)
})
export type Summary = z.infer<typeof SummarySchema>

export const ScanStateSchema = z.object({ running: z.boolean(), rootId: z.number().nullable(), lastScanAt: z.string().nullable() })
export type ScanState = z.infer<typeof ScanStateSchema>

export const contracts = {
  'prefs:load': { req: z.void(), res: PreferencesSchema },
  'prefs:save': { req: PreferencesSchema, res: z.void() },
  /** carpeta de datos y archivo de registro, para Configuración y el Acerca de */
  'paths:info': { req: z.void(), res: z.object({ dataDir: z.string(), logFile: z.string() }) },
  'log:tail': { req: z.object({ lines: z.number().int().positive() }), res: z.array(z.string()) },

  'roots:list': { req: z.void(), res: z.array(RootSchema) },
  'roots:add': { req: Path, res: z.number() },
  'roots:remove': { req: RootRef, res: z.void() },
  'roots:scan': { req: z.object({ rootId: z.number().nullable() }), res: z.void() },
  'roots:scanState': { req: z.void(), res: ScanStateSchema },
  'roots:errors': { req: z.void(), res: z.array(z.object({ path: z.string(), message: z.string() })) },
  'roots:setMark': { req: RootRef.extend({ mark: FolderMarkSchema }), res: z.void() },
  'roots:simulateMark': { req: RootRef.extend({ mark: FolderMarkSchema }), res: SimulationSchema },
  'roots:setTags': { req: RootRef.extend({ tags: z.array(z.string()) }), res: z.void() },
  'roots:setExcludes': { req: RootRef.extend({ patterns: z.array(z.string()) }), res: z.void() },
  'extensions:get': { req: z.void(), res: ExtensionFilterSchema },
  'extensions:save': { req: z.object({ rootId: z.number().nullable(), filter: ExtensionFilterSchema.nullable() }), res: z.void() },

  'summary:get': { req: z.void(), res: SummarySchema },
  'files:ofRoot': { req: RootRef, res: z.array(FileRowSchema) },
  'files:get': { req: z.object({ fileId: z.number() }), res: FileRowSchema },
  'files:search': { req: SearchFiltersSchema, res: z.array(FileRowSchema) },
  'files:scheduled': { req: z.void(), res: z.array(FileRowSchema) },
  'files:expiring': { req: z.void(), res: z.array(FileRowSchema) },

  'marks:apply': { req: MarkRequestSchema, res: z.number() },
  'marks:note': { req: z.object({ fileId: z.number(), note: z.string() }), res: z.void() },
  'marks:trash': { req: FileIds.extend({ confirmedPermanent: z.number().nullable() }), res: TrashResultSchema },
  /** F-13: archivos que llegan del clic derecho, aunque su carpeta no esté vigilada */
  'marks:fromExplorer': { req: z.object({ paths: z.array(z.string()).min(1), action: MarkActionSchema, dueDate: DaySchema.nullable() }), res: z.number() },
  'marks:export': { req: Path, res: z.number() },
  'marks:import': { req: Path, res: z.object({ matched: z.number(), unmatched: z.number() }) },
  'batches:list': { req: z.void(), res: z.array(BatchSchema) },
  'batches:undo': { req: z.object({ batchId: z.number().nullable() }), res: z.object({ restored: z.number(), failed: z.array(z.string()) }) },

  'proposals:list': { req: z.void(), res: z.array(ProposalSchema) },
  'proposals:reject': { req: FileIds, res: z.void() },
  'duplicates:list': { req: z.void(), res: z.array(z.object({ contentId: z.number(), sizeBytes: z.number(), keepFileId: z.number(), files: z.array(FileRowSchema) })) },
  'rules:list': { req: z.void(), res: z.array(RuleSettingSchema) },
  'rules:save': { req: RuleSettingSchema, res: z.void() },
  'rules:simulate': { req: z.object({ ruleId: z.enum(RULE_IDS), thresholdDays: z.number().int().positive().nullable() }), res: SimulationSchema },
  'customRules:list': { req: z.void(), res: z.array(CustomRuleSchema) },
  'customRules:save': { req: z.object({ ruleId: z.number().int().positive().nullable(), enabled: z.boolean(), draft: CustomRuleDraftSchema }), res: z.number() },
  'customRules:delete': { req: z.object({ ruleId: z.number().int().positive() }), res: z.void() },
  'customRules:simulate': { req: CustomRuleDraftSchema, res: SimulationSchema },

  'photos:similar': { req: z.void(), res: z.array(SimilarGroupSchema) },
  'photos:prefer': { req: z.object({ groupKey: z.string(), fileId: z.number() }), res: z.void() },
  'photos:ofRoot': { req: RootRef, res: z.array(PhotoInfoSchema) },
  'photos:organize': { req: OrganizeRequestSchema, res: OrganizeResultSchema },

  'tags:list': { req: z.void(), res: z.array(z.object({ name: z.string(), files: z.number() })) },
  'tags:add': { req: FileIds.extend({ names: z.array(z.string()).min(1) }), res: z.void() },
  'tags:remove': { req: FileIds.extend({ name: z.string() }), res: z.void() },
  'searches:list': { req: z.void(), res: z.array(SavedSearchSchema) },
  'searches:save': { req: z.object({ name: z.string().min(1), filters: SearchFiltersSchema }), res: z.number() },
  'searches:delete': { req: z.object({ searchId: z.number() }), res: z.void() },

  'notices:ack': { req: z.object({ eventIds: z.array(z.number()) }), res: z.void() },
  'dailyPass:run': { req: z.void(), res: z.void() }
} as const

export type Channel = keyof typeof contracts
export type Req<C extends Channel> = z.input<(typeof contracts)[C]['req']>
export type Res<C extends Channel> = z.infer<(typeof contracts)[C]['res']>

export const AppErrorSchema = z.object({ message: z.string() })
export type RpcResult = { ok: true; data: unknown } | { ok: false; error: z.infer<typeof AppErrorSchema> }

export function isChannel(value: unknown): value is Channel {
  // hasOwn y no `in`: `in` también acepta toString, constructor y el resto de lo heredado de Object
  return typeof value === 'string' && Object.hasOwn(contracts, value)
}

/** Eventos del backend hacia la interfaz (y hacia main, que muestra los avisos). */
export const AppEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('prefs:changed'), preferences: PreferencesSchema }),
  /** el índice cambió (revisión, vigilancia, pasada diaria): la interfaz vuelve a pedir lo que muestra */
  z.object({ type: z.literal('index:changed') }),
  z.object({ type: z.literal('scan:state'), state: ScanStateSchema }),
  z.object({ type: z.literal('notices'), pending: z.array(PendingNoticeSchema) })
])

export type AppEvent = z.infer<typeof AppEventSchema>
export interface BackendRequest {
  id: number
  channel: Channel
  payload: unknown
}
export interface BackendResponse {
  id: number
  result: RpcResult
}
export interface BackendEvent {
  event: AppEvent
}
export type AboutInfo = z.infer<typeof AboutInfoSchema>
