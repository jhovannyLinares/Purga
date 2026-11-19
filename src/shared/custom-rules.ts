import { z } from 'zod'
import { OriginSchema } from './model'

/**
 * Reglas propias (lámina 13): condiciones fijas que se cumplen todas a la vez. Como las de fábrica, solo proponen.
 * Los días sin abrir son obligatorios: una regla sin plazo propondría de golpe todo lo que cumpla el resto.
 */
export const MAX_IDLE_DAYS = 3650
export const MAX_EXTENSIONS = 20
const NAME_MAX = 80

/** Dónde busca: dentro de una carpeta, por el origen del archivo, o en todas las carpetas vigiladas. */
export const ScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('any') }),
  z.object({ kind: z.literal('folder'), folder: z.string().min(1) }),
  z.object({ kind: z.literal('origin'), origin: OriginSchema })
])
export type RuleScope = z.infer<typeof ScopeSchema>

export const CustomRuleDraftSchema = z.object({
  name: z.string().trim().min(1).max(NAME_MAX),
  scope: ScopeSchema,
  /** sin punto y en minúsculas: «mp4», «mov» */
  extensions: z.array(z.string().regex(/^[a-z0-9]{1,10}$/)).max(MAX_EXTENSIONS),
  nameContains: z.string().trim().max(NAME_MAX),
  idleDays: z.number().int().min(1).max(MAX_IDLE_DAYS),
  minBytes: z.number().int().nonnegative().nullable()
})
export type CustomRuleDraft = z.infer<typeof CustomRuleDraftSchema>

export const CustomRuleSchema = CustomRuleDraftSchema.extend({ ruleId: z.number().int().positive(), enabled: z.boolean() })
export type CustomRule = z.infer<typeof CustomRuleSchema>

/** En rule_match las reglas propias se guardan como «U-{id}», junto a las de fábrica («BD-n»). */
const CUSTOM_PREFIX = 'U-'
export const customSource = (ruleId: number) => `${CUSTOM_PREFIX}${ruleId}`
export const isCustomSource = (source: string) => source.startsWith(CUSTOM_PREFIX)

/** «.MP4, mov; .Mkv» → ['mp4', 'mov', 'mkv']: lo que la persona escribe, como lo compara el índice. */
export function parseExtensions(text: string): string[] {
  const parts = text.split(/[\s,;]+/).map((part) => part.trim().replace(/^\./, '').toLowerCase()).filter(Boolean)
  return [...new Set(parts)]
}
