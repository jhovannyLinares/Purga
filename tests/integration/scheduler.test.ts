import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fileRow } from '../../src/backend/files'
import { applyMarks, undoBatch } from '../../src/backend/marks'
import { addRoot } from '../../src/backend/roots'
import { reconcileRoot } from '../../src/backend/scan'
import { ackNotices, dailyPassDue, executeScheduled, pendingNotices, runDailyPass } from '../../src/backend/scheduler'
import { idOf, memoryDb, NO_OPENINGS, tree } from '../helpers'

const TODAY = '2026-11-04'

/** P4 · programados, pasada diaria y avisos (F-6, F-11, F-14, §5.3). */
describe('pasada diaria', () => {
  beforeEach(() => {
    process.env.PURGA_NOW = `${TODAY}T08:00:00.000Z`
  })
  afterEach(() => {
    delete process.env.PURGA_NOW
  })

  it('un programado con fecha de hoy va a la Papelera tras verificar identidad; uno modificado pasa a Revisar', async () => {
    const folder = tree({ 'vence-hoy.txt': 'purga hoy', 'cambiado.txt': 'purga original' })
    const db = memoryDb()
    await reconcileRoot(db, addRoot(db, folder), NO_OPENINGS)
    await applyMarks(db, { fileIds: [idOf(db, 'vence-hoy.txt'), idOf(db, 'cambiado.txt')], action: 'deleteOn', dueDate: TODAY, expiresOn: null }, 'programar')
    writeFileSync(join(folder, 'cambiado.txt'), 'purga cambiado después de marcarlo')
    expect(await executeScheduled(db, TODAY)).toBe(1)
    expect(existsSync(join(folder, 'vence-hoy.txt'))).toBe(false)
    expect(fileRow(db, idOf(db, 'cambiado.txt'))).toMatchObject({ action: 'review', closedReason: 'modified' })
    expect(pendingNotices(db).map((pending) => pending.notice)).toEqual([{ kind: 'executed', trashed: 1, failed: 0 }])
    const batch = db.prepare('SELECT batch_id FROM batch ORDER BY batch_id DESC LIMIT 1').get() as { batch_id: number }
    await undoBatch(db, batch.batch_id, () => undefined, () => undefined)
    expect(existsSync(join(folder, 'vence-hoy.txt'))).toBe(true)
  })

  it('F-19: en un disco sin Papelera no se ejecuta solo: pasa a Propuestas', async () => {
    const folder = tree({ 'usb.txt': 'x' })
    const db = memoryDb()
    await reconcileRoot(db, addRoot(db, folder), NO_OPENINGS)
    await applyMarks(db, { fileIds: [idOf(db, 'usb.txt')], action: 'deleteOn', dueDate: TODAY, expiresOn: null }, 'programar')
    db.exec('UPDATE volume SET has_recycle_bin = 0')
    expect(await executeScheduled(db, TODAY)).toBe(0)
    expect(existsSync(join(folder, 'usb.txt'))).toBe(true)
    expect(db.prepare("SELECT rule_id FROM rule_match WHERE resolution = 'pending'").all()).toEqual([{ rule_id: 'F-19' }])
  })

  it('un vencimiento avisa una sola vez por umbral; el mañana de los programados avisa una vez', async () => {
    const folder = tree({ 'contrato.pdf': 'x', 'manana.txt': 'y' })
    const db = memoryDb()
    await reconcileRoot(db, addRoot(db, folder), NO_OPENINGS)
    await applyMarks(db, { fileIds: [idOf(db, 'contrato.pdf')], action: 'keep', dueDate: null, expiresOn: '2026-11-10' }, 'conservar')
    await applyMarks(db, { fileIds: [idOf(db, 'manana.txt')], action: 'deleteOn', dueDate: '2026-11-05', expiresOn: null }, 'programar')
    expect(dailyPassDue(db, `${TODAY}T08:00:00.000Z`)).toBe(true)
    await runDailyPass(db, TODAY)
    const notices = pendingNotices(db).map((pending) => pending.notice)
    expect(notices).toEqual([
      { kind: 'expiry', name: 'contrato.pdf', days: 6, expiresOn: '2026-11-10' },
      { kind: 'dueTomorrow', count: 1 }
    ])
    ackNotices(db, pendingNotices(db).map((pending) => pending.eventId))
    await runDailyPass(db, TODAY)
    expect(pendingNotices(db)).toEqual([])
    expect(dailyPassDue(db, `${TODAY}T09:00:00.000Z`)).toBe(false)
  })
})
