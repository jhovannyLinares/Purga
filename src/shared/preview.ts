import { z } from 'zod'

/** Vista previa sin abrir la app del archivo (F-20). */
export const PreviewSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('image'), dataUrl: z.string() }),
  z.object({ kind: z.literal('pdf'), thumbnail: z.string().nullable() }),
  z.object({ kind: z.literal('thumbnail'), dataUrl: z.string() }),
  z.object({ kind: z.literal('text'), lines: z.array(z.string()), truncated: z.boolean() }),
  z.object({ kind: z.literal('archive'), entries: z.array(z.object({ name: z.string(), size: z.number() })), total: z.number() }),
  z.object({ kind: z.literal('executable'), company: z.string(), product: z.string(), version: z.string(), signature: z.string() }),
  z.object({ kind: z.literal('none') }),
  z.object({ kind: z.literal('missing') })
])
export type Preview = z.infer<typeof PreviewSchema>

export const TEXT_PREVIEW_LINES = 40
