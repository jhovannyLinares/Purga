import { renameSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fileRow, filesOfRoot } from '../../src/backend/files'
import { applyMarks } from '../../src/backend/marks'
import { addRoot, removeRoot, saveExtensionFilter, setExcludes, setFolderMark } from '../../src/backend/roots'
import { reconcileRoot } from '../../src/backend/scan'
import { idOf, memoryDb, NO_OPENINGS, tree } from '../helpers'

/** P1 · índice y carpetas (F-1, F-2, F-3, F-5, F-12, M-1, M-2, M-4). */
describe('índice', () => {
  it('indexa 1.000 archivos y refleja agregar, renombrar y borrar', async () => {
    const files: Record<string, string> = {}
    for (let index = 0; index < 1000; index++) files[`sub${index % 10}/archivo-${index}.txt`] = `contenido ${index}`
    const folder = tree(files)
    const db = memoryDb()
    const rootId = addRoot(db, folder)
    const first = await reconcileRoot(db, rootId, NO_OPENINGS)
    expect(first.added).toBe(1000)

    writeFileSync(join(folder, 'nuevo.txt'), 'x')
    renameSync(join(folder, 'sub1', 'archivo-1.txt'), join(folder, 'sub2', 'renombrado.txt'))
    rmSync(join(folder, 'sub3', 'archivo-3.txt'))
    const second = await reconcileRoot(db, rootId, NO_OPENINGS)
    expect(second.added).toBe(1)
    expect(second.missing).toBe(1)
    expect(filesOfRoot(db, rootId)).toHaveLength(1000)
    expect(fileRow(db, idOf(db, 'renombrado.txt')).path).toBe(join(folder, 'sub2', 'renombrado.txt'))
    expect(fileRow(db, idOf(db, 'archivo-3.txt')).presence).toBe('missing')
  })

  it('M-2: la marca sigue al archivo renombrado; M-1: modificado después de marcarlo pasa a Revisar', async () => {
    const folder = tree({ 'a.txt': 'uno', 'b.txt': 'dos' })
    const db = memoryDb()
    const rootId = addRoot(db, folder)
    await reconcileRoot(db, rootId, NO_OPENINGS)
    await applyMarks(db, { fileIds: [idOf(db, 'a.txt'), idOf(db, 'b.txt')], action: 'deleteOn', dueDate: '2030-01-01', expiresOn: null }, 'prueba')
    renameSync(join(folder, 'a.txt'), join(folder, 'a-renombrado.txt'))
    writeFileSync(join(folder, 'b.txt'), 'dos, pero cambiado')
    await reconcileRoot(db, rootId, NO_OPENINGS)
    expect(fileRow(db, idOf(db, 'a-renombrado.txt')).action).toBe('deleteOn')
    const changed = fileRow(db, idOf(db, 'b.txt'))
    expect(changed.action).toBe('review')
    expect(changed.closedReason).toBe('modified')
  })

  it('M-4: lo marcado que desaparece queda cerrado «ya no existe»', async () => {
    const folder = tree({ 'a.txt': 'uno' })
    const db = memoryDb()
    const rootId = addRoot(db, folder)
    await reconcileRoot(db, rootId, NO_OPENINGS)
    await applyMarks(db, { fileIds: [idOf(db, 'a.txt')], action: 'delete', dueDate: null, expiresOn: null }, 'prueba')
    rmSync(join(folder, 'a.txt'))
    await reconcileRoot(db, rootId, NO_OPENINGS)
    expect(fileRow(db, idOf(db, 'a.txt')).closedReason).toBe('missing')
  })

  it('F-1: una carpeta que deja de estar pone sus archivos en pausa, no perdidos', async () => {
    const folder = tree({ 'a.txt': 'uno' })
    const db = memoryDb()
    const rootId = addRoot(db, folder)
    await reconcileRoot(db, rootId, NO_OPENINGS)
    rmSync(folder, { recursive: true })
    const summary = await reconcileRoot(db, rootId, NO_OPENINGS)
    expect(summary.paused).toBe(true)
    expect(fileRow(db, idOf(db, 'a.txt')).presence).toBe('paused')
  })

  it('F-2: el origen sale de Zone.Identifier, de la ruta, o es Desconocido', async () => {
    const folder = tree({ 'bajado.pdf': '%PDF', 'WhatsApp Image 2026-01-02 at 10.00.jpg': 'jpg', 'otro.txt': 'x' })
    writeFileSync(join(folder, 'bajado.pdf') + ':Zone.Identifier', '[ZoneTransfer]\r\nZoneId=3\r\nHostUrl=https://ejemplo.com/bajado.pdf\r\n')
    const db = memoryDb()
    await reconcileRoot(db, addRoot(db, folder), NO_OPENINGS)
    expect(fileRow(db, idOf(db, 'bajado.pdf'))).toMatchObject({ origin: 'browser', originConfidence: 0.95, originEvidence: 'https://ejemplo.com/bajado.pdf' })
    expect(fileRow(db, idOf(db, 'WhatsApp Image 2026-01-02 at 10.00.jpg')).origin).toBe('whatsapp')
    expect(fileRow(db, idOf(db, 'otro.txt'))).toMatchObject({ origin: 'unknown', originConfidence: 0 })
  })

  it('F-3: la apertura sale de Recent; sin ella, cuenta la modificación', async () => {
    const folder = tree({ 'abierto.docx': 'x', 'cerrado.docx': 'y' })
    utimesSync(join(folder, 'cerrado.docx'), new Date('2025-01-01'), new Date('2025-01-01'))
    const db = memoryDb()
    const openings = new Map([[join(folder, 'abierto.docx').toLowerCase(), '2026-10-01T10:00:00.000Z']])
    await reconcileRoot(db, addRoot(db, folder), openings)
    expect(fileRow(db, idOf(db, 'abierto.docx')).openedAt).toBe('2026-10-01T10:00:00.000Z')
    expect(fileRow(db, idOf(db, 'cerrado.docx'))).toMatchObject({ openedAt: null, modifiedAt: '2025-01-01T00:00:00.000Z' })
  })

  it('F-12: la carpeta gana sobre el global; excluir no borra lo marcado (EXT-4)', async () => {
    const folder = tree({ 'a.log': 'x', 'b.log': 'y', 'c.txt': 'z' })
    const db = memoryDb()
    const rootId = addRoot(db, folder)
    await reconcileRoot(db, rootId, NO_OPENINGS)
    expect(filesOfRoot(db, rootId)).toHaveLength(3)
    await applyMarks(db, { fileIds: [idOf(db, 'a.log')], action: 'keep', dueDate: null, expiresOn: '2027-01-01' }, 'prueba')
    saveExtensionFilter(db, null, { mode: 'deny', extensions: ['.LOG'] })
    saveExtensionFilter(db, rootId, { mode: 'allow', extensions: ['log'] })
    await reconcileRoot(db, rootId, NO_OPENINGS)
    expect(filesOfRoot(db, rootId).map((row) => row.name).sort()).toEqual(['a.log', 'b.log'])
    saveExtensionFilter(db, rootId, null)
    await reconcileRoot(db, rootId, NO_OPENINGS)
    const rows = filesOfRoot(db, rootId)
    expect(rows.map((row) => [row.name, row.presence])).toEqual([['a.log', 'filtered_out'], ['c.txt', 'present']])
  })

  it('F-5: un archivo nuevo hereda la marca de su carpeta; la del archivo gana', async () => {
    const folder = tree({ 'viejo.txt': 'x' })
    const db = memoryDb()
    const rootId = addRoot(db, folder)
    setFolderMark(db, rootId, { kind: 'keepAll' })
    await reconcileRoot(db, rootId, NO_OPENINGS)
    expect(fileRow(db, idOf(db, 'viejo.txt'))).toMatchObject({ action: 'keep', markSource: 'folder' })
  })

  it('F-1: las exclusiones de la carpeta se saltan en la revisión', async () => {
    const folder = tree({ 'proyecto/node_modules/lib.js': 'x', 'proyecto/main.js': 'y', 'borrador.tmp': 'z' })
    const db = memoryDb()
    const rootId = addRoot(db, folder)
    setExcludes(db, rootId, ['node_modules', '*.tmp'])
    await reconcileRoot(db, rootId, NO_OPENINGS)
    expect(filesOfRoot(db, rootId).map((row) => row.name)).toEqual(['main.js'])
  })

  it('dejar de vigilar conserva como sueltos los archivos marcados', async () => {
    const folder = tree({ 'a.txt': 'x', 'b.txt': 'y' })
    const db = memoryDb()
    const rootId = addRoot(db, folder)
    await reconcileRoot(db, rootId, NO_OPENINGS)
    await applyMarks(db, { fileIds: [idOf(db, 'a.txt')], action: 'archived', dueDate: null, expiresOn: null }, 'prueba')
    removeRoot(db, rootId)
    expect(fileRow(db, idOf(db, 'a.txt')).loose).toBe(true)
    expect(() => idOf(db, 'b.txt')).toThrow()
  })
})
