import { z } from 'zod'

/** Lo que viaja entre el backend y la interfaz sobre archivos, carpetas y marcas (spec §3). */

export const MARK_ACTIONS = ['unreviewed', 'keep', 'delete', 'deleteOn', 'review', 'archived'] as const
export const MarkActionSchema = z.enum(MARK_ACTIONS)
export type MarkAction = z.infer<typeof MarkActionSchema>

export const ORIGINS = ['browser', 'outlook', 'whatsapp', 'telegram', 'screenshot', 'downloads', 'unknown'] as const
export const OriginSchema = z.enum(ORIGINS)
export type Origin = z.infer<typeof OriginSchema>

export const PRESENCES = ['present', 'missing', 'paused', 'filtered_out'] as const
export type Presence = (typeof PRESENCES)[number]

/** Fecha de calendario `AAAA-MM-DD`: las marcas con fecha se cumplen por día, no por hora. */
export const DaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const FolderMarkSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('inherit') }),
  z.object({ kind: z.literal('keepAll') }),
  z.object({ kind: z.literal('deleteOlderThan'), days: z.number().int().positive() }),
  z.object({ kind: z.literal('reviewEvery'), days: z.number().int().positive() }),
  z.object({ kind: z.literal('photosByDate'), destination: z.string().min(1) })
])
export type FolderMark = z.infer<typeof FolderMarkSchema>

export const ExtensionModeSchema = z.enum(['deny', 'allow'])
export type ExtensionMode = z.infer<typeof ExtensionModeSchema>

export const ExtensionFilterSchema = z.object({ mode: ExtensionModeSchema, extensions: z.array(z.string()) })
export type ExtensionFilter = z.infer<typeof ExtensionFilterSchema>

export const RootSchema = z.object({
  rootId: z.number(),
  path: z.string(),
  name: z.string(),
  folderMark: FolderMarkSchema,
  /** null = hereda el filtro global (EXT-1) */
  extensions: ExtensionFilterSchema.nullable(),
  tags: z.array(z.string()),
  /** patrones de nombre que la revisión salta (node_modules, *.tmp) */
  excludes: z.array(z.string()),
  files: z.number(),
  bytes: z.number(),
  online: z.boolean(),
  hasRecycleBin: z.boolean()
})
export type Root = z.infer<typeof RootSchema>

export const FileRowSchema = z.object({
  fileId: z.number(),
  rootId: z.number().nullable(),
  path: z.string(),
  name: z.string(),
  extension: z.string(),
  sizeBytes: z.number(),
  modifiedAt: z.string(),
  openedAt: z.string().nullable(),
  presence: z.enum(PRESENCES),
  loose: z.boolean(),
  origin: OriginSchema,
  originConfidence: z.number(),
  originEvidence: z.string().nullable(),
  action: MarkActionSchema,
  markSource: z.enum(['manual', 'folder', 'rule']).nullable(),
  dueDate: DaySchema.nullable(),
  expiresOn: DaySchema.nullable(),
  note: z.string(),
  closedReason: z.string().nullable(),
  tags: z.array(z.object({ name: z.string(), source: z.enum(['manual', 'folder', 'rule']) })),
  hasRecycleBin: z.boolean()
})
export type FileRow = z.infer<typeof FileRowSchema>

export const MarkRequestSchema = z.object({
  fileIds: z.array(z.number()).min(1),
  action: MarkActionSchema,
  dueDate: DaySchema.nullable().default(null),
  expiresOn: DaySchema.nullable().default(null)
})
export type MarkRequest = z.infer<typeof MarkRequestSchema>

export const BatchSchema = z.object({ batchId: z.number(), description: z.string(), createdAt: z.string(), undoneAt: z.string().nullable(), files: z.number() })
export type Batch = z.infer<typeof BatchSchema>

/** Por qué un archivo no llegó a la Papelera o no volvió de ella; la interfaz lo traduce (`trashFail.*`). */
export const TrashFailureSchema = z.enum(['missing', 'locked', 'denied', 'tooLong', 'badName', 'exists', 'notInBin', 'other'])
export type TrashFailure = z.infer<typeof TrashFailureSchema>

export const TrashResultSchema = z.object({
  batchId: z.number().nullable(),
  trashed: z.number(),
  deleted: z.number(),
  failed: z.array(z.object({ name: z.string(), reason: TrashFailureSchema }))
})
export type TrashResult = z.infer<typeof TrashResultSchema>
