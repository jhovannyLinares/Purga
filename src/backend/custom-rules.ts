import { CustomRuleDraftSchema, customSource, ScopeSchema, type CustomRule, type CustomRuleDraft } from '@shared/custom-rules'
import type { Simulation } from '@shared/rules'
import { z } from 'zod'
import { addDays, nowIso, type Database } from './db'
import { LAST_ACTIVITY_SQL, selectRows } from './files'
import { logWarn } from './log'
import { NOT_PROTECTED } from './protection'
import type { Candidate } from './rules'

/** Reglas propias (lámina 13): guardar, listar, simular y lo que proponen hoy. Proponen; nunca borran. */

const ALL_ROWS = 1_000_000

interface StoredRule {
  rule_id: number
  name: string
  enabled: number
  scope: string
  extensions: string
  name_contains: string
  idle_days: number
  min_bytes: number | null
}

const ExtensionsSchema = z.array(z.string())

/** Una fila guardada que no se puede leer (editada a mano, corrupta) se salta con un aviso; las demás siguen. */
function readRule(row: StoredRule): CustomRule | null {
  try {
    const draft = CustomRuleDraftSchema.parse({
      name: row.name,
      scope: ScopeSchema.parse(JSON.parse(row.scope)),
      extensions: ExtensionsSchema.parse(JSON.parse(row.extensions)),
      nameContains: row.name_contains,
      idleDays: row.idle_days,
      minBytes: row.min_bytes
    })
    return { ...draft, ruleId: row.rule_id, enabled: row.enabled === 1 }
  } catch (error) {
    logWarn('customRule.read', `se salta: ${error instanceof Error ? error.message : String(error)}`, `regla ${row.rule_id}`)
    return null
  }
}

export function listCustomRules(db: Database): CustomRule[] {
  const rows = db.prepare('SELECT rule_id, name, enabled, scope, extensions, name_contains, idle_days, min_bytes FROM custom_rule ORDER BY rule_id').all() as unknown as StoredRule[]
  return rows.map(readRule).filter((rule): rule is CustomRule => rule !== null)
}

/** Crea la regla (sin ruleId) o la reemplaza; devuelve su id. */
export function saveCustomRule(db: Database, draft: CustomRuleDraft, ruleId: number | null, enabled: boolean): number {
  const values = [draft.name, enabled ? 1 : 0, JSON.stringify(draft.scope), JSON.stringify(draft.extensions), draft.nameContains, draft.idleDays, draft.minBytes]
  if (ruleId === null) {
    const result = db.prepare('INSERT INTO custom_rule(name, enabled, scope, extensions, name_contains, idle_days, min_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(...values, nowIso())
    return Number(result.lastInsertRowid)
  }
  db.prepare('UPDATE custom_rule SET name = ?, enabled = ?, scope = ?, extensions = ?, name_contains = ?, idle_days = ?, min_bytes = ? WHERE rule_id = ?').run(...values, ruleId)
  return ruleId
}

export function deleteCustomRule(db: Database, ruleId: number): void {
  db.prepare('DELETE FROM custom_rule WHERE rule_id = ?').run(ruleId)
  db.prepare("DELETE FROM rule_match WHERE rule_id = ? AND resolution = 'pending'").run(customSource(ruleId))
}

/** «%» y «_» que escribe la persona son texto, no comodines de LIKE. */
const likeLiteral = (text: string) => text.replace(/[\\%_]/g, (character) => `\\${character}`)

function scopeCondition(draft: CustomRuleDraft): { where: string; params: string[] } {
  switch (draft.scope.kind) {
    case 'any':
      return { where: '1 = 1', params: [] }
    case 'folder': {
      const folder = draft.scope.folder.replace(/[\\/]+$/, '')
      return { where: "lower(f.path) LIKE lower(?) ESCAPE '\\'", params: [`${likeLiteral(folder)}\\\\%`] }
    }
    case 'origin':
      return { where: "ifnull(p.origin, 'unknown') = ?", params: [draft.scope.origin] }
  }
}

function candidates(db: Database, draft: CustomRuleDraft, today: string, detail: string): Candidate[] {
  const scope = scopeCondition(draft)
  const conditions = [NOT_PROTECTED, scope.where, `${LAST_ACTIVITY_SQL} < ?`]
  const params: (string | number)[] = [today, ...scope.params, addDays(today, -draft.idleDays)]
  if (draft.extensions.length > 0) {
    conditions.push(`f.extension IN (${draft.extensions.map(() => '?').join(', ')})`)
    params.push(...draft.extensions)
  }
  if (draft.nameContains) {
    conditions.push("lower(f.name) LIKE lower(?) ESCAPE '\\'")
    params.push(`%${likeLiteral(draft.nameContains)}%`)
  }
  if (draft.minBytes !== null) {
    conditions.push('f.size_bytes >= ?')
    params.push(draft.minBytes)
  }
  return selectRows(db, conditions.join(' AND '), params, 'f.path', ALL_ROWS).map((row) => ({ fileId: row.fileId, sizeBytes: row.sizeBytes, modifiedAt: row.modifiedAt, detail }))
}

/** Simular antes de guardar: cuenta lo que la regla propondría hoy, sin dejar propuestas. */
export function simulateCustomRule(db: Database, draft: CustomRuleDraft, today: string): Simulation {
  const found = candidates(db, draft, today, draft.name)
  return { files: found.length, bytes: found.reduce((total, candidate) => total + candidate.sizeBytes, 0) }
}

/** Lo que propone hoy cada regla propia activa; el nombre de la regla viaja como detalle de la propuesta. */
export function customRuleMatches(db: Database, today: string): { active: { source: string; found: Candidate[] }[] } {
  const active = listCustomRules(db).filter((rule) => rule.enabled)
  return { active: active.map((rule) => ({ source: customSource(rule.ruleId), found: candidates(db, rule, today, rule.name) })) }
}
