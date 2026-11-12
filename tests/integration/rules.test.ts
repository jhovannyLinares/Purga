import { utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { hashContents, duplicateGroups } from '../../src/backend/duplicates'
import { applyMarks } from '../../src/backend/marks'
import { addRoot } from '../../src/backend/roots'
import { evaluateRules, listProposals, rejectProposals, saveRuleSetting, simulateRule } from '../../src/backend/rules'
import { reconcileRoot } from '../../src/backend/scan'
import { customSource, type CustomRuleDraft } from '@shared/custom-rules'
import { RULE_IDS } from '@shared/rules'
import { deleteCustomRule, listCustomRules, saveCustomRule, simulateCustomRule } from '../../src/backend/custom-rules'
import { idOf, memoryDb, NO_OPENINGS, tempFolder, tree } from '../helpers'

const TODAY = '2026-11-04'
const OLD = new Date('2026-01-01T00:00:00Z')

/** Set de prueba: cada regla BD tiene al menos un archivo que debe proponer y uno que no. */
async function fixture() {
  const base = tempFolder()
  const downloads = join(base, 'Downloads')
  const folder = tree({
    'Downloads/bajado-viejo.pdf': 'bajado viejo',
    'Downloads/bajado-nuevo.pdf': 'bajado nuevo',
    'Downloads/setup.exe': 'instalador',
    'informe_borrador.docx': 'borrador',
    'presupuesto_v1.xlsx': 'version 1',
    'presupuesto_v2.xlsx': 'version 2',
    '~$abierto.docx': 'residuo',
    'descarga.crdownload': 'descarga a medias',
    'foto.jpg': 'duplicado exacto',
    'Downloads/foto (1).jpg': 'duplicado exacto',
    'conservado.pdf': 'conservar'
  }, base)
  writeFileSync(join(downloads, 'bajado-viejo.pdf') + ':Zone.Identifier', '[ZoneTransfer]\r\nHostUrl=https://ejemplo.com/a\r\n')
  writeFileSync(join(downloads, 'bajado-nuevo.pdf') + ':Zone.Identifier', '[ZoneTransfer]\r\nHostUrl=https://ejemplo.com/b\r\n')
  for (const name of ['Downloads/bajado-viejo.pdf', 'Downloads/setup.exe', 'informe_borrador.docx', 'presupuesto_v1.xlsx', '~$abierto.docx', 'descarga.crdownload', 'conservado.pdf']) {
    utimesSync(join(folder, name), OLD, OLD)
  }
  const db = memoryDb()
  await reconcileRoot(db, addRoot(db, folder), NO_OPENINGS)
  await hashContents(db)
  return { db, folder }
}

const proposed = (db: ReturnType<typeof memoryDb>, ruleId: string) =>
  listProposals(db).filter((proposal) => proposal.source === ruleId).map((proposal) => proposal.file.name).sort()

/** P5 · reglas, propuestas y duplicados (F-7, F-8, F-18). */
describe('reglas', () => {
  it('cada regla BD propone lo que debe y Simular cuenta lo mismo que propone', async () => {
    const { db } = await fixture()
    evaluateRules(db, TODAY)
    expect(proposed(db, 'BD-1')).toEqual(['bajado-viejo.pdf'])
    expect(proposed(db, 'BD-2')).toEqual(['informe_borrador.docx', 'presupuesto_v1.xlsx'])
    expect(proposed(db, 'BD-4')).toEqual(['presupuesto_v1.xlsx'])
    expect(proposed(db, 'BD-5')).toEqual(['foto (1).jpg'])
    expect(proposed(db, 'BD-6')).toEqual(['descarga.crdownload', '~$abierto.docx'])
    expect(proposed(db, 'BD-7')).toEqual(['setup.exe'])
    const tagged = db.prepare("SELECT f.name FROM file f JOIN file_tag ft USING (file_id) JOIN tag t USING (tag_id) WHERE t.name = 'borrador' ORDER BY f.name").all()
    expect(tagged.map((row) => (row as { name: string }).name)).toEqual(['foto (1).jpg', 'informe_borrador.docx', 'presupuesto_v1.xlsx', 'presupuesto_v2.xlsx'])
    for (const ruleId of RULE_IDS.filter((id) => id !== 'BD-3')) {
      expect(simulateRule(db, ruleId, ruleId === 'BD-5' ? null : (ruleId === 'BD-2' ? 60 : ruleId === 'BD-6' ? 7 : 30), TODAY).files).toBe(proposed(db, ruleId).length)
    }
  })

  it('Conservar gana sobre las reglas; un rechazo se recuerda hasta que el archivo cambie', async () => {
    const { db, folder } = await fixture()
    await applyMarks(db, { fileIds: [idOf(db, 'setup.exe')], action: 'keep', dueDate: null, expiresOn: null }, 'conservar')
    evaluateRules(db, TODAY)
    expect(proposed(db, 'BD-7')).toEqual([])
    rejectProposals(db, [idOf(db, 'bajado-viejo.pdf')])
    evaluateRules(db, TODAY)
    expect(proposed(db, 'BD-1')).toEqual([])
    writeFileSync(join(folder, 'Downloads', 'bajado-viejo.pdf'), 'cambió')
    utimesSync(join(folder, 'Downloads', 'bajado-viejo.pdf'), new Date('2026-02-01'), new Date('2026-02-01'))
    await reconcileRoot(db, 1, NO_OPENINGS)
    evaluateRules(db, TODAY)
    expect(proposed(db, 'BD-1')).toEqual(['bajado-viejo.pdf'])
  })

  it('una regla apagada no propone; el umbral se edita', async () => {
    const { db } = await fixture()
    saveRuleSetting(db, { ruleId: 'BD-6', enabled: false, thresholdDays: 7 })
    saveRuleSetting(db, { ruleId: 'BD-7', enabled: true, thresholdDays: 1000 })
    evaluateRules(db, TODAY)
    expect(proposed(db, 'BD-6')).toEqual([])
    expect(proposed(db, 'BD-7')).toEqual([])
  })

  it('F-8: los bloqueos de Office (~$) de hojas distintas no son duplicados', async () => {
    const base = tempFolder()
    const folder = tree({ '~$hoja-a.xlsx': 'jhovanny', '~$hoja-b.xlsx': 'jhovanny', 'a.txt': 'igual', 'b.txt': 'igual' }, base)
    const db = memoryDb()
    await reconcileRoot(db, addRoot(db, folder), NO_OPENINGS)
    await hashContents(db)
    expect(duplicateGroups(db).map((group) => group.files.map((file) => file.name).sort())).toEqual([['a.txt', 'b.txt']])
  })

  it('F-8: el duplicado conserva la copia fuera de Descargas', async () => {
    const { db } = await fixture()
    const [group] = duplicateGroups(db)
    expect(group!.files.find((file) => file.fileId === group!.keepFileId)!.name).toBe('foto.jpg')
  })
})

/** Lámina 13 · reglas propias: condiciones fijas, todas con Y; solo proponen. */
describe('reglas propias', () => {
  const pdfsInDownloads = (folder: string): CustomRuleDraft => ({
    name: 'PDF viejos de Descargas',
    scope: { kind: 'folder', folder: join(folder, 'Downloads') },
    extensions: ['pdf'],
    nameContains: '',
    idleDays: 30,
    minBytes: null
  })

  it('propone lo que cumple todas las condiciones, y Simular cuenta lo mismo', async () => {
    const { db, folder } = await fixture()
    const ruleId = saveCustomRule(db, pdfsInDownloads(folder), null, true)
    evaluateRules(db, TODAY)
    expect(proposed(db, customSource(ruleId))).toEqual(['bajado-viejo.pdf'])
    expect(simulateCustomRule(db, pdfsInDownloads(folder), TODAY).files).toBe(1)
    const [proposal] = listProposals(db).filter((item) => item.source === customSource(ruleId))
    expect(proposal!.detail).toBe('PDF viejos de Descargas')
  })

  it('el texto del nombre es literal: un «_» no es comodín', async () => {
    const { db } = await fixture()
    const draft: CustomRuleDraft = { name: 'v1', scope: { kind: 'any' }, extensions: [], nameContains: '_v1', idleDays: 30, minBytes: null }
    const ruleId = saveCustomRule(db, draft, null, true)
    evaluateRules(db, TODAY)
    expect(proposed(db, customSource(ruleId))).toEqual(['presupuesto_v1.xlsx'])
  })

  it('Conservar gana, apagarla o borrarla quita sus pendientes', async () => {
    const { db, folder } = await fixture()
    await applyMarks(db, { fileIds: [idOf(db, 'bajado-viejo.pdf')], action: 'keep', dueDate: null, expiresOn: null }, 'conservar')
    const ruleId = saveCustomRule(db, { ...pdfsInDownloads(folder), scope: { kind: 'any' } }, null, true)
    evaluateRules(db, TODAY)
    expect(proposed(db, customSource(ruleId))).toEqual(['conservado.pdf'])
    saveCustomRule(db, { ...pdfsInDownloads(folder), scope: { kind: 'any' } }, ruleId, false)
    evaluateRules(db, TODAY)
    expect(proposed(db, customSource(ruleId))).toEqual([])
    saveCustomRule(db, { ...pdfsInDownloads(folder), scope: { kind: 'any' } }, ruleId, true)
    evaluateRules(db, TODAY)
    deleteCustomRule(db, ruleId)
    expect(proposed(db, customSource(ruleId))).toEqual([])
  })

  it('una regla guardada que se lee rota se salta y las demás siguen', async () => {
    const { db, folder } = await fixture()
    const broken = saveCustomRule(db, pdfsInDownloads(folder), null, true)
    db.prepare("UPDATE custom_rule SET scope = '{\"kind\":' WHERE rule_id = ?").run(broken)
    const healthy = saveCustomRule(db, pdfsInDownloads(folder), null, true)
    expect(listCustomRules(db).map((rule) => rule.ruleId)).toEqual([healthy])
    evaluateRules(db, TODAY)
    expect(proposed(db, customSource(healthy))).toEqual(['bajado-viejo.pdf'])
  })
})
