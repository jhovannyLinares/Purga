import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fileRow } from '../../src/backend/files'
import { applyMarks, lastUndoableBatch, setNote, trashFiles, undoBatch } from '../../src/backend/marks'
import { addRoot, listRoots } from '../../src/backend/roots'
import { reconcileRoot } from '../../src/backend/scan'
import { idOf, memoryDb, NO_OPENINGS, tree } from '../helpers'

const noMove = () => {
  throw new Error('no se esperaba mover')
}
const noCopy = () => undefined
const LONG_PREFIX = '\\\\?\\'
const MAX_SHELL_PATH = 260

async function indexed(files: Record<string, string>) {
  const folder = tree(files)
  const db = memoryDb()
  await reconcileRoot(db, addRoot(db, folder), NO_OPENINGS)
  return { folder, db }
}

/** P2 · marcas, lotes y Papelera (F-4, F-6, F-19, M-6). */
describe('marcas y Papelera', () => {
  it('marca 3 en un lote y Deshacer devuelve la marca anterior y conserva la nota', async () => {
    const { db } = await indexed({ 'a.txt': 'a', 'b.txt': 'b', 'c.txt': 'c' })
    const ids = ['a.txt', 'b.txt', 'c.txt'].map((name) => idOf(db, name))
    setNote(db, ids[0]!, 'contrato de arriendo')
    await applyMarks(db, { fileIds: [ids[0]!], action: 'keep', dueDate: null, expiresOn: '2027-03-01' }, 'conservar')
    const batchId = await applyMarks(db, { fileIds: ids, action: 'deleteOn', dueDate: '2026-12-01', expiresOn: null }, 'eliminar el')
    expect(ids.map((id) => fileRow(db, id).action)).toEqual(['deleteOn', 'deleteOn', 'deleteOn'])
    expect(fileRow(db, ids[0]!).note).toBe('contrato de arriendo')
    expect(lastUndoableBatch(db)).toBe(batchId)
    await undoBatch(db, batchId, noMove, noCopy)
    expect(fileRow(db, ids[0]!)).toMatchObject({ action: 'keep', expiresOn: '2027-03-01', note: 'contrato de arriendo' })
    expect(fileRow(db, ids[1]!).action).toBe('unreviewed')
    await expect(undoBatch(db, batchId, noMove, noCopy)).rejects.toThrow('ya se deshizo')
  })

  it('envía a la Papelera de Windows y Deshacer los saca de ahí', async () => {
    const { folder, db } = await indexed({ 'uno.txt': 'purga uno', 'dos.txt': 'purga dos' })
    const ids = [idOf(db, 'uno.txt'), idOf(db, 'dos.txt')]
    const result = await trashFiles(db, ids, 'a la Papelera', null)
    expect(result).toMatchObject({ trashed: 2, deleted: 0, failed: [] })
    expect(existsSync(join(folder, 'uno.txt'))).toBe(false)
    expect(fileRow(db, ids[0]!).presence).toBe('missing')
    const undone = await undoBatch(db, result.batchId!, noMove, noCopy)
    expect(undone.failed).toEqual([])
    expect(existsSync(join(folder, 'uno.txt'))).toBe(true)
    expect(existsSync(join(folder, 'dos.txt'))).toBe(true)
    expect(fileRow(db, ids[1]!).presence).toBe('present')
  })

  it('Deshacer no pisa un archivo que el usuario volvió a crear con el mismo nombre', async () => {
    const { folder, db } = await indexed({ 'recreado.txt': 'el que se mandó a la Papelera' })
    const result = await trashFiles(db, [idOf(db, 'recreado.txt')], 'a la Papelera', null)
    writeFileSync(join(folder, 'recreado.txt'), 'el nuevo del usuario')
    const undone = await undoBatch(db, result.batchId!, noMove, noCopy)
    expect(undone.restored).toBe(0)
    expect(undone.failed).toHaveLength(1)
    expect(readFileSync(join(folder, 'recreado.txt'), 'utf8')).toBe('el nuevo del usuario')
  })

  it('una ruta de más de 260 caracteres va a la Papelera y vuelve; un nombre con punto final se informa', async () => {
    const deep = join(...Array.from({ length: 6 }, () => 'carpeta-con-nombre-largo-para-pasar-el-limite'))
    const { folder, db } = await indexed({ [join(deep, 'archivo final.txt')]: 'largo' })
    // con el prefijo, Windows no recorta el punto ni el espacio del final al crearlo
    writeFileSync(`${LONG_PREFIX}${join(folder, 'recorte. ')}`, 'punto')
    await reconcileRoot(db, listRoots(db)[0]!.rootId, NO_OPENINGS)
    const longPath = join(folder, deep, 'archivo final.txt')
    expect(longPath.length).toBeGreaterThan(MAX_SHELL_PATH)
    const result = await trashFiles(db, [idOf(db, 'archivo final.txt'), idOf(db, 'recorte. ')], 'a la Papelera', null)
    expect(result).toMatchObject({ trashed: 1, failed: [{ name: 'recorte. ', reason: 'badName' }] })
    expect(existsSync(longPath)).toBe(false)
    const undone = await undoBatch(db, result.batchId!, noMove, noCopy)
    expect(undone.failed).toEqual([])
    expect(readFileSync(longPath, 'utf8')).toBe('largo')
  })

  it('M-2 al borrar: si el archivo se movió en el disco, se encuentra por su File ID', async () => {
    const { folder, db } = await indexed({ 'movido.txt': 'purga movido' })
    renameSync(join(folder, 'movido.txt'), join(folder, 'otro-nombre.txt'))
    const result = await trashFiles(db, [idOf(db, 'movido.txt')], 'a la Papelera', null)
    expect(result.trashed).toBe(1)
    expect(existsSync(join(folder, 'otro-nombre.txt'))).toBe(false)
    await undoBatch(db, result.batchId!, noMove, noCopy)
  })

  it('F-19: en un disco sin Papelera no borra sin la confirmación fuerte', async () => {
    const { db } = await indexed({ 'usb.txt': 'x' })
    db.exec('UPDATE volume SET has_recycle_bin = 0')
    await expect(trashFiles(db, [idOf(db, 'usb.txt')], 'borrar', null)).rejects.toThrow('confirmación fuerte')
    await expect(trashFiles(db, [idOf(db, 'usb.txt')], 'borrar', 2)).rejects.toThrow('confirmación fuerte')
    const result = await trashFiles(db, [idOf(db, 'usb.txt')], 'borrar', 1)
    expect(result).toMatchObject({ trashed: 0, deleted: 1 })
  })
})
