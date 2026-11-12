import { z } from 'zod'
import { FileRowSchema } from './model'

/** Reglas de limpieza (spec §4.2): solo proponen. `F-10` y `F-19` son propuestas que no salen de una regla BD. */
export const RULE_IDS = ['BD-1', 'BD-2', 'BD-3', 'BD-4', 'BD-5', 'BD-6', 'BD-7'] as const
export type RuleId = (typeof RULE_IDS)[number]
/** «U-{id}»: una regla propia (shared/custom-rules.ts). */
export const ProposalSourceSchema = z.union([z.enum([...RULE_IDS, 'F-10', 'F-19']), z.string().regex(/^U-\d+$/)])
export type ProposalSource = z.infer<typeof ProposalSourceSchema>

/** Umbral de fábrica en días; null = la regla no tiene umbral. */
export const RULE_DEFAULT_DAYS: Record<RuleId, number | null> = {
  'BD-1': 30,
  'BD-2': 60,
  'BD-3': null,
  'BD-4': 30,
  'BD-5': null,
  'BD-6': 7,
  'BD-7': 30
}

/** Nombre de borrador o copia temporal (BD-2, BD-3, BD-4). */
export const DRAFT_NAME = /(borrador|draft|_v\d+\b|\bv\d+\b|\bcopy\b|\bcopia\b|\(\d+\)|final_final|final ?\(\d+\))/i

/** Nombre normalizado de una familia de versiones (BD-4): sin las marcas de versión ni la extensión. */
export function familyName(name: string): string {
  const dot = name.lastIndexOf('.')
  const stem = dot > 0 ? name.slice(0, dot) : name
  return stem
    .toLowerCase()
    .replace(/[_\s-]*(borrador|draft|copy|copia|final)\b/g, '')
    .replace(/[_\s-]*v\d+\b/g, '')
    .replace(/\s*\(\d+\)/g, '')
    .replace(/[_\s-]+$/g, '')
}

export const RuleSettingSchema = z.object({
  ruleId: z.enum(RULE_IDS),
  enabled: z.boolean(),
  thresholdDays: z.number().int().positive().nullable()
})
export type RuleSetting = z.infer<typeof RuleSettingSchema>

export const SimulationSchema = z.object({ files: z.number(), bytes: z.number() })
export type Simulation = z.infer<typeof SimulationSchema>

export const ProposalSchema = z.object({ source: ProposalSourceSchema, detail: z.string().nullable(), file: FileRowSchema })
export type Proposal = z.infer<typeof ProposalSchema>
