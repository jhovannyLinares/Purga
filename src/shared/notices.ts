import { z } from 'zod'

/** Avisos que el backend deja en la bandeja de salida y main muestra como notificación de Windows (F-14). */
export const NoticeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('expiry'), name: z.string(), days: z.number(), expiresOn: z.string() }),
  z.object({ kind: z.literal('dueTomorrow'), count: z.number() }),
  z.object({ kind: z.literal('reviewToday'), count: z.number() }),
  z.object({ kind: z.literal('executed'), trashed: z.number(), failed: z.number() }),
  z.object({ kind: z.literal('needsConfirmation'), count: z.number() }),
  z.object({ kind: z.literal('volumeOffline'), count: z.number() }),
  z.object({ kind: z.literal('photosMoved'), count: z.number() })
])
export type Notice = z.infer<typeof NoticeSchema>

export const PendingNoticeSchema = z.object({ eventId: z.number(), notice: NoticeSchema })
export type PendingNotice = z.infer<typeof PendingNoticeSchema>

/** Avisos de vencimiento: tantos días antes, una sola vez cada uno (F-11). */
export const EXPIRY_THRESHOLDS = [60, 30, 7, 1] as const
