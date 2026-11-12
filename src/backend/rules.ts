import { DRAFT_NAME, familyName, RULE_DEFAULT_DAYS, RULE_IDS, type Proposal, type ProposalSource, type RuleId, type RuleSetting, type Simulation } from '@shared/rules'
import { addDays, nowIso, transaction, type Database } from './db'
import { duplicateGroups } from './duplicates'
import { LAST_ACTIVITY_SQL, selectRows } from './files'
import { customRuleMatches } from './custom-rules'
import { NOT_PROTECTED } from './protection'
import { addTags } from './tags'

/** Reglas de limpieza BD-1 a BD-7 (F-7, F-18). Proponen; nunca borran. */

export function ruleSettings(db: Database): RuleSetting[] {
  const stored = new Map((db.prepare('SELECT rule_id, enabled, threshold_days FROM rule').all() as { rule_id: RuleId; enabled: number; threshold_days: number | null }[]).map((row) => [row.rule_id, row]))
  return RULE_IDS.map((ruleId) => {
    const row = stored.get(ruleId)
    return { ruleId, enabled: row ? row.enabled === 1 : true, thresholdDays: row ? row.threshold_days : RULE_DEFAULT_DAYS[ruleId] }
  })
}

export function saveRuleSetting(db: Database, setting: RuleSetting): void {
  const threshold = RULE_DEFAULT_DAYS[setting.ruleId] === null ? null : setting.thresholdDays
  db.prepare('INSERT INTO rule(rule_id, enabled, threshold_days) VALUES (?, ?, ?) ON CONFLICT(rule_id) DO UPDATE SET enabled = excluded.enabled, threshold_days = excluded.threshold_days')
    .run(setting.ruleId, setting.enabled ? 1 : 0, threshold)
}

export interface Candidate {
  fileId: number
  sizeBytes: number
  modifiedAt: string
  detail: string | null
}

/** Archivos que la regla propone hoy, con su umbral. */
function candidates(db: Database, ruleId: RuleId, thresholdDays: number | null, today: string): Candidate[] {
  const cutoff = thresholdDays === null ? today : addDays(today, -thresholdDays)
  const rows = (where: string, params: (string | number)[]) =>
    selectRows(db, `${NOT_PROTECTED} AND ${where}`, [today, ...params], 'f.path', 1_000_000).map((row) => ({ fileId: row.fileId, sizeBytes: row.sizeBytes, modifiedAt: row.modifiedAt, path: row.path, name: row.name }))
  const plain = (list: ReturnType<typeof rows>, detail: string | null = null): Candidate[] => list.map((row) => ({ ...row, detail }))
  switch (ruleId) {
    case 'BD-1':
      return plain(rows(`p.origin IN ('browser', 'whatsapp', 'telegram') AND ${LAST_ACTIVITY_SQL} < ?`, [cutoff]))
    case 'BD-2':
      return plain(rows(`${LAST_ACTIVITY_SQL} < ?`, [cutoff]).filter((row) => DRAFT_NAME.test(row.name)))
    case 'BD-3':
      return plain(rows("f.file_id NOT IN (SELECT file_id FROM file_tag JOIN tag USING (tag_id) WHERE tag.name = 'borrador')", []).filter((row) => DRAFT_NAME.test(row.name)))
    case 'BD-4':
      return olderVersions(rows('1 = 1', []), cutoff)
    case 'BD-5':
      return duplicateGroups(db).flatMap((group) =>
        group.files.filter((file) => file.fileId !== group.keepFileId).map((file) => ({ fileId: file.fileId, sizeBytes: file.sizeBytes, modifiedAt: file.modifiedAt, detail: String(group.keepFileId) }))
      ).filter((candidate) => isUnprotected(db, candidate.fileId, today))
    case 'BD-6':
      return plain(rows(`(f.name LIKE '~$%' OR f.extension IN ('tmp', 'crdownload', 'part')) AND f.modified_at < ?`, [cutoff]))
    case 'BD-7':
      return plain(rows(`f.extension IN ('exe', 'msi') AND (lower(f.path) LIKE '%\\downloads\\%' OR lower(f.path) LIKE '%\\descargas\\%') AND ${LAST_ACTIVITY_SQL} < ?`, [cutoff]))
  }
}

function isUnprotected(db: Database, fileId: number, today: string): boolean {
  return !!db.prepare(`SELECT 1 FROM file f WHERE f.file_id = ? AND ${NOT_PROTECTED}`).get(fileId, today)
}

/** BD-4: en una familia (misma carpeta y nombre normalizado) la versión más reciente queda; las anteriores, viejas, se proponen. */
function olderVersions(files: { fileId: number; sizeBytes: number; modifiedAt: string; path: string; name: string }[], cutoff: string): Candidate[] {
  const families = new Map<string, typeof files>()
  for (const file of files) {
    const folder = file.path.slice(0, file.path.length - file.name.length).toLowerCase()
    const key = `${folder}|${familyName(file.name)}`
    families.set(key, [...(families.get(key) ?? []), file])
  }
  const result: Candidate[] = []
  for (const members of families.values()) {
    if (members.length < 2) continue
    const newest = members.reduce((left, right) => (right.modifiedAt > left.modifiedAt ? right : left))
    for (const member of members) {
      if (member !== newest && member.modifiedAt < cutoff) result.push({ ...member, detail: newest.name })
    }
  }
  return result
}

export function simulateRule(db: Database, ruleId: RuleId, thresholdDays: number | null, today: string): Simulation {
  const found = candidates(db, ruleId, thresholdDays, today)
  return { files: found.length, bytes: found.reduce((total, candidate) => total + candidate.sizeBytes, 0) }
}

/**
 * Pasa las reglas activas y deja sus propuestas en `rule_match`. Un rechazo se recuerda hasta que el archivo cambie
 * (su fecha de modificación); lo que ya no cumple la regla sale de las pendientes.
 */
export function evaluateRules(db: Database, today: string): number {
  return transaction(db, () => {
    let created = 0
    for (const setting of ruleSettings(db)) {
      if (!setting.enabled) {
        db.prepare("DELETE FROM rule_match WHERE rule_id = ? AND resolution = 'pending'").run(setting.ruleId)
        continue
      }
      const found = candidates(db, setting.ruleId, setting.thresholdDays, today)
      if (setting.ruleId === 'BD-3') {
        if (found.length > 0) addTags(db, found.map((candidate) => candidate.fileId), ['borrador'], 'rule')
        continue
      }
      created += syncMatches(db, setting.ruleId, found)
    }
    const custom = customRuleMatches(db, today)
    for (const { source, found } of custom.active) created += syncMatches(db, source, found)
    // una regla propia apagada o borrada deja de proponer
    const activeSources = custom.active.map((match) => match.source)
    db.prepare(`DELETE FROM rule_match WHERE rule_id LIKE 'U-%' AND resolution = 'pending' AND rule_id NOT IN (${activeSources.map(() => '?').join(', ') || "''"})`).run(...activeSources)
    return created
  })
}

/** Lo que la regla propone hoy queda pendiente; lo que ya no cumple sale de las pendientes. */
function syncMatches(db: Database, source: ProposalSource, found: Candidate[]): number {
  const current = new Set(found.map((candidate) => candidate.fileId))
  const pending = db.prepare("SELECT file_id FROM rule_match WHERE rule_id = ? AND resolution = 'pending'").all(source) as { file_id: number }[]
  for (const { file_id } of pending) if (!current.has(file_id)) db.prepare('DELETE FROM rule_match WHERE rule_id = ? AND file_id = ?').run(source, file_id)
  let created = 0
  for (const candidate of found) created += recordMatch(db, source, candidate)
  return created
}

/** Deja una propuesta; 1 si es nueva. */
export function recordMatch(db: Database, source: ProposalSource, candidate: Candidate): number {
  const existing = db.prepare('SELECT resolution, file_modified_at FROM rule_match WHERE rule_id = ? AND file_id = ?').get(source, candidate.fileId) as { resolution: string; file_modified_at: string } | undefined
  if (existing && !(existing.resolution === 'rejected' && existing.file_modified_at !== candidate.modifiedAt)) return 0
  db.prepare(`INSERT INTO rule_match(rule_id, file_id, resolution, file_modified_at, detail, found_at) VALUES (?, ?, 'pending', ?, ?, ?)
    ON CONFLICT(rule_id, file_id) DO UPDATE SET resolution = 'pending', file_modified_at = excluded.file_modified_at, detail = excluded.detail, found_at = excluded.found_at`)
    .run(source, candidate.fileId, candidate.modifiedAt, candidate.detail, nowIso())
  return 1
}

export function listProposals(db: Database): Proposal[] {
  const matches = db.prepare("SELECT rule_id, file_id, detail FROM rule_match WHERE resolution = 'pending' ORDER BY rule_id, file_id").all() as { rule_id: ProposalSource; file_id: number; detail: string | null }[]
  const rows = new Map(selectRows(db, "f.file_id IN (SELECT file_id FROM rule_match WHERE resolution = 'pending') AND f.presence = 'present'", [], 'f.name', 1_000_000).map((row) => [row.fileId, row]))
  return matches.flatMap((match) => {
    const file = rows.get(match.file_id)
    return file ? [{ source: match.rule_id, detail: match.detail, file }] : []
  })
}

export function rejectProposals(db: Database, fileIds: number[]): void {
  const reject = db.prepare("UPDATE rule_match SET resolution = 'rejected' WHERE file_id = ? AND resolution = 'pending'")
  transaction(db, () => fileIds.forEach((fileId) => reject.run(fileId)))
}
