import { Fragment, useContext, useState } from 'react'
import { parseExtensions, type CustomRule, type CustomRuleDraft, type RuleScope } from '@shared/custom-rules'
import type { Language, TextKey } from '@shared/i18n'
import { ORIGINS, type Origin } from '@shared/model'
import { RULE_DEFAULT_DAYS, type RuleId, type RuleSetting } from '@shared/rules'
import { useActions } from '../actions'
import { call } from '../api'
import { useBackend } from '../data'
import { formatBytes, ORIGIN_LABEL } from '../format'
import { InfoIcon } from '../icons'
import { LanguageContext, useText } from '../text'
import { ListHead } from '../ui'
import { SOURCE_LABEL } from './ProposalsView'

/** Reglas (F-18, lámina 13): las de fábrica como frase, su panel ⓘ, y las propias con su formulario. Solo proponen. */

type Text = ReturnType<typeof useText>

interface RuleCopy {
  sentence: TextKey
  what: TextKey
  example: TextKey
  tech: TextKey
}

const RULE_COPY: Record<RuleId, RuleCopy> = {
  'BD-1': { sentence: 'rules.bd1Condition', what: 'rules.bd1What', example: 'rules.bd1Example', tech: 'rules.bd1Tech' },
  'BD-2': { sentence: 'rules.bd2Condition', what: 'rules.bd2What', example: 'rules.bd2Example', tech: 'rules.bd2Tech' },
  'BD-3': { sentence: 'rules.bd3Condition', what: 'rules.bd3What', example: 'rules.bd3Example', tech: 'rules.bd3Tech' },
  'BD-4': { sentence: 'rules.bd4Condition', what: 'rules.bd4What', example: 'rules.bd4Example', tech: 'rules.bd4Tech' },
  'BD-5': { sentence: 'rules.bd5Condition', what: 'rules.bd5What', example: 'rules.bd5Example', tech: 'rules.bd5Tech' },
  'BD-6': { sentence: 'rules.bd6Condition', what: 'rules.bd6What', example: 'rules.bd6Example', tech: 'rules.bd6Tech' },
  'BD-7': { sentence: 'rules.bd7Condition', what: 'rules.bd7What', example: 'rules.bd7Example', tech: 'rules.bd7Tech' }
}

const DAYS_SLOT = '{days}'
const BYTES_PER_MB = 1024 * 1024

/** Qué abre la lista: el panel ⓘ de una regla de fábrica, o el formulario (nueva o editando una propia). */
type Opened = { kind: 'info'; ruleId: RuleId } | { kind: 'form'; rule: CustomRule | null } | null

export function RulesView() {
  const t = useText()
  const language = useContext(LanguageContext)
  const actions = useActions()
  const { data: settings } = useBackend('rules:list')
  const { data: customRules } = useBackend('customRules:list')
  const [simulations, setSimulations] = useState<Record<string, string>>({})
  const [opened, setOpened] = useState<Opened>(null)
  const simulationText = (files: number, bytes: number) => t('rules.wouldPropose', { count: files, size: formatBytes(bytes, language) })

  const save = (setting: RuleSetting) => actions.run(async () => {
    await call('rules:save', setting)
    return { text: t('toast.ruleSaved', { rule: t(SOURCE_LABEL[setting.ruleId]) }) }
  })
  const simulate = (setting: RuleSetting) => actions.run(async () => {
    const result = await call('rules:simulate', { ruleId: setting.ruleId, thresholdDays: setting.thresholdDays })
    setSimulations((current) => ({ ...current, [setting.ruleId]: simulationText(result.files, result.bytes) }))
    return null
  })
  const toggleCustom = (rule: CustomRule, enabled: boolean) => actions.run(async () => {
    await call('customRules:save', { ruleId: rule.ruleId, enabled, draft: rule })
    return { text: t('toast.customRuleSaved', { name: rule.name }) }
  })
  const removeCustom = (rule: CustomRule) => actions.run(async () => {
    await call('customRules:delete', { ruleId: rule.ruleId })
    setOpened(null)
    return { text: t('toast.customRuleDeleted', { name: rule.name }) }
  })
  const toggleInfo = (ruleId: RuleId) => setOpened(opened?.kind === 'info' && opened.ruleId === ruleId ? null : { kind: 'info', ruleId })

  return (
    <div className="view-scroll">
      <ListHead title={t('menu.rules').replace('…', '')} sub={t('rules.sub')}>
        <button className="btn small primary" type="button" onClick={() => setOpened({ kind: 'form', rule: null })}>{t('rules.new')}</button>
      </ListHead>
      {opened?.kind === 'form' && opened.rule === null && <CustomRuleForm rule={null} onDone={() => setOpened(null)} simulationText={simulationText} />}
      <div className="table" style={{ flex: 'none' }}>
        {(settings ?? []).map((setting) => (
          <Fragment key={setting.ruleId}>
            <RuleRow setting={setting} simulation={simulations[setting.ruleId] ?? ''} onSave={save} onSimulate={simulate} onInfo={() => toggleInfo(setting.ruleId)} infoOpen={opened?.kind === 'info' && opened.ruleId === setting.ruleId} />
            {opened?.kind === 'info' && opened.ruleId === setting.ruleId && <RuleInfo ruleId={setting.ruleId} simulation={simulations[setting.ruleId]} />}
          </Fragment>
        ))}
        {(customRules ?? []).map((rule) => (
          <Fragment key={`custom-${rule.ruleId}`}>
            <CustomRuleRow rule={rule} onToggle={toggleCustom} onEdit={() => setOpened({ kind: 'form', rule })} />
            {opened?.kind === 'form' && opened.rule?.ruleId === rule.ruleId && <CustomRuleForm rule={rule} onDone={() => setOpened(null)} onDelete={() => removeCustom(rule)} simulationText={simulationText} />}
          </Fragment>
        ))}
      </div>
      <div className="notice">{t('rules.notice')}</div>
    </div>
  )
}

interface RuleRowProps {
  setting: RuleSetting
  simulation: string
  onSave: (setting: RuleSetting) => void
  onSimulate: (setting: RuleSetting) => void
  onInfo: () => void
  infoOpen: boolean
}

/** Una regla de fábrica como frase completa; el número de días va dentro de la frase. */
function RuleRow({ setting, simulation, onSave, onSimulate, onInfo, infoOpen }: RuleRowProps) {
  const t = useText()
  const [threshold, setThreshold] = useState(setting.thresholdDays)
  const hasThreshold = RULE_DEFAULT_DAYS[setting.ruleId] !== null
  const current = { ...setting, thresholdDays: threshold }
  const [before, after] = t(RULE_COPY[setting.ruleId].sentence).split(DAYS_SLOT)
  const name = t(SOURCE_LABEL[setting.ruleId])
  const commitThreshold = () => {
    if (threshold && threshold !== setting.thresholdDays) onSave(current)
  }
  return (
    <div className="tr static cols-rules">
      <input type="checkbox" checked={setting.enabled} aria-label={name} onChange={(event) => onSave({ ...current, enabled: event.target.checked })} />
      <span className="rule-text">
        <b>{name}</b>
        <p>
          {before}
          {hasThreshold && after !== undefined && (
            <>
              <input type="number" min={1} value={threshold ?? ''} aria-label={t('rules.threshold')} onChange={(event) => setThreshold(Number(event.target.value) || null)} onBlur={commitThreshold} />
              {after}
            </>
          )}
        </p>
        {simulation && <span className="muted">{simulation}</span>}
      </span>
      <span className="row" style={{ gap: 6 }}>
        <button className={`icon-btn ${infoOpen ? 'on' : ''}`} type="button" title={t('rules.info')} aria-label={t('rules.info')} aria-expanded={infoOpen} onClick={onInfo}><InfoIcon /></button>
        <button className="btn small" type="button" onClick={() => onSimulate(current)}>{t('rules.simulate')}</button>
      </span>
    </div>
  )
}

/** Panel ⓘ: qué revisa, un ejemplo, qué nunca toca y el detalle técnico (los patrones que salieron de la frase). */
function RuleInfo({ ruleId, simulation }: { ruleId: RuleId; simulation?: string }) {
  const t = useText()
  const copy = RULE_COPY[ruleId]
  return (
    <div className="rule-side">
      <dl>
        <dt>{t('rules.infoWhat')}</dt><dd>{t(copy.what)}</dd>
        <dt>{t('rules.infoExample')}</dt><dd>{t(copy.example)}</dd>
        <dt>{t('rules.infoNever')}</dt><dd>{t('rules.neverTouches')}</dd>
        <dt>{t('rules.infoTech')}</dt><dd>{t(copy.tech)}</dd>
        {simulation && <><dt>{t('rules.infoToday')}</dt><dd>{simulation}</dd></>}
      </dl>
    </div>
  )
}

function describeScope(t: Text, scope: RuleScope): string {
  if (scope.kind === 'folder') return t('rules.cWhereFolder', { folder: scope.folder })
  if (scope.kind === 'origin') return t('rules.cWhereOrigin', { origin: t(ORIGIN_LABEL[scope.origin]) })
  return t('rules.cWhereAny')
}

/** La regla propia leída como frase: «En «…», archivos .mp4, sin abrir hace más de 90 días y de más de 50 MB.» */
function describeCustomRule(t: Text, rule: CustomRuleDraft, language: Language): string {
  const parts = [describeScope(t, rule.scope)]
  if (rule.extensions.length > 0) parts.push(t('rules.cTypes', { types: rule.extensions.map((extension) => `.${extension}`).join(', ') }))
  if (rule.nameContains) parts.push(t('rules.cContains', { text: rule.nameContains }))
  parts.push(t('rules.cIdle', { days: rule.idleDays }))
  if (rule.minBytes !== null) parts.push(t('rules.cMin', { size: formatBytes(rule.minBytes, language) }))
  return `${parts.join('')}.`
}

function CustomRuleRow({ rule, onToggle, onEdit }: { rule: CustomRule; onToggle: (rule: CustomRule, enabled: boolean) => void; onEdit: () => void }) {
  const t = useText()
  const language = useContext(LanguageContext)
  return (
    <div className="tr static cols-rules">
      <input type="checkbox" checked={rule.enabled} aria-label={rule.name} onChange={(event) => onToggle(rule, event.target.checked)} />
      <span className="rule-text">
        <b>{rule.name} <span className="badge new">{t('rules.custom')}</span></b>
        <p>{describeCustomRule(t, rule, language)}</p>
      </span>
      <span><button className="btn small" type="button" onClick={onEdit}>{t('rules.edit')}</button></span>
    </div>
  )
}

/** Lo que se escribe en el formulario, antes de convertirlo en una regla válida. */
interface FormState {
  name: string
  scopeKind: RuleScope['kind']
  folder: string
  origin: Origin
  extensions: string
  nameContains: string
  idleDays: string
  minMegabytes: string
}

function formFrom(rule: CustomRule | null): FormState {
  return {
    name: rule?.name ?? '',
    scopeKind: rule?.scope.kind ?? 'folder',
    folder: rule?.scope.kind === 'folder' ? rule.scope.folder : '',
    origin: rule?.scope.kind === 'origin' ? rule.scope.origin : 'browser',
    extensions: rule ? rule.extensions.map((extension) => `.${extension}`).join(', ') : '',
    nameContains: rule?.nameContains ?? '',
    idleDays: String(rule?.idleDays ?? 90),
    minMegabytes: rule?.minBytes != null ? String(Math.round(rule.minBytes / BYTES_PER_MB)) : ''
  }
}

function scopeFrom(form: FormState): RuleScope {
  if (form.scopeKind === 'folder') return { kind: 'folder', folder: form.folder }
  if (form.scopeKind === 'origin') return { kind: 'origin', origin: form.origin }
  return { kind: 'any' }
}

/** El borrador que viaja al backend; null si falta algo obligatorio (el backend lo vuelve a validar con zod). */
function draftFrom(form: FormState): CustomRuleDraft | null {
  const idleDays = Number(form.idleDays)
  const needsFolder = form.scopeKind === 'folder' && !form.folder
  if (!form.name.trim() || needsFolder || !Number.isInteger(idleDays) || idleDays < 1) return null
  const minMegabytes = form.minMegabytes.trim() === '' ? null : Number(form.minMegabytes)
  return {
    name: form.name.trim(),
    scope: scopeFrom(form),
    extensions: parseExtensions(form.extensions),
    nameContains: form.nameContains.trim(),
    idleDays,
    minBytes: minMegabytes === null || Number.isNaN(minMegabytes) ? null : Math.round(minMegabytes * BYTES_PER_MB)
  }
}

interface CustomRuleFormProps {
  rule: CustomRule | null
  onDone: () => void
  onDelete?: () => void
  simulationText: (files: number, bytes: number) => string
}

function CustomRuleForm({ rule, onDone, onDelete, simulationText }: CustomRuleFormProps) {
  const t = useText()
  const actions = useActions()
  const [form, setForm] = useState<FormState>(() => formFrom(rule))
  const [simulation, setSimulation] = useState('')
  const set = (change: Partial<FormState>) => {
    setForm((current) => ({ ...current, ...change }))
    setSimulation('')
  }
  const draft = draftFrom(form)
  const pickFolder = async () => {
    const folder = await window.purga.pickFolder()
    if (folder) set({ folder })
  }
  const simulate = () => draft && actions.run(async () => {
    const result = await call('customRules:simulate', draft)
    setSimulation(simulationText(result.files, result.bytes))
    return null
  })
  const save = () => draft && actions.run(async () => {
    await call('customRules:save', { ruleId: rule?.ruleId ?? null, enabled: rule?.enabled ?? true, draft })
    onDone()
    return { text: t('toast.customRuleSaved', { name: draft.name }) }
  })
  return (
    <div className="rule-side">
      <div className="rule-form">
        <label htmlFor="rule-name">{t('rules.formName')}</label>
        <input id="rule-name" value={form.name} onChange={(event) => set({ name: event.target.value })} />
        <label htmlFor="rule-where">{t('rules.formWhere')}</label>
        <span className="grow-row">
          <select id="rule-where" value={form.scopeKind} onChange={(event) => set({ scopeKind: event.target.value as RuleScope['kind'] })}>
            <option value="folder">{t('rules.whereFolder')}</option>
            <option value="origin">{t('rules.whereOrigin')}</option>
            <option value="any">{t('rules.whereAny')}</option>
          </select>
          {form.scopeKind === 'folder' && (
            <>
              <input value={form.folder} readOnly placeholder={t('rules.formFolderMissing')} aria-label={t('rules.whereFolder')} title={form.folder} />
              <button className="btn small" type="button" onClick={() => void pickFolder()}>{t('common.choose')}</button>
            </>
          )}
          {form.scopeKind === 'origin' && (
            <select value={form.origin} aria-label={t('rules.whereOrigin')} onChange={(event) => set({ origin: event.target.value as Origin })}>
              {ORIGINS.map((origin) => <option key={origin} value={origin}>{t(ORIGIN_LABEL[origin])}</option>)}
            </select>
          )}
        </span>
        <label htmlFor="rule-types">{t('rules.formType')}</label>
        <input id="rule-types" value={form.extensions} placeholder={`${t('rules.formTypeHint')} (${t('rules.formOptional')})`} onChange={(event) => set({ extensions: event.target.value })} />
        <label htmlFor="rule-contains">{t('rules.formContains')}</label>
        <input id="rule-contains" value={form.nameContains} placeholder={t('rules.formOptional')} onChange={(event) => set({ nameContains: event.target.value })} />
        <label htmlFor="rule-idle">{t('rules.formIdle')}</label>
        <span className="grow-row"><input id="rule-idle" type="number" min={1} value={form.idleDays} onChange={(event) => set({ idleDays: event.target.value })} /> {t('rules.formDays')}</span>
        <label htmlFor="rule-min">{t('rules.formMin')}</label>
        <span className="grow-row"><input id="rule-min" type="number" min={0} value={form.minMegabytes} placeholder={t('rules.formOptional')} onChange={(event) => set({ minMegabytes: event.target.value })} /> MB</span>
      </div>
      <div className="notice" style={{ margin: 0 }}>{t('rules.formNotice')}</div>
      <div className="row" style={{ gap: 8 }}>
        {onDelete && <button className="btn small danger" type="button" onClick={onDelete}>{t('rules.delete')}</button>}
        <span className="grow muted">{simulation}</span>
        <button className="btn small" type="button" onClick={onDone}>{t('common.cancel')}</button>
        <button className="btn small" type="button" disabled={!draft} onClick={simulate}>{t('rules.simulate')}</button>
        <button className="btn small primary" type="button" disabled={!draft} onClick={save}>{t('rules.formSave')}</button>
      </div>
    </div>
  )
}
