import { describe, expect, it } from 'vitest'
import { SearchFiltersSchema } from '@shared/filters'
import { join } from 'node:path'
import { decisionOf } from '../../src/backend/decisions'
import { exportMarks, importMarks, readMarksFile } from '../../src/backend/exchange'
import { fileRow } from '../../src/backend/files'
import { applyMarks, lastUndoableBatch, setNote, undoBatch } from '../../src/backend/marks'
import { addRoot } from '../../src/backend/roots'
import { reconcileRoot } from '../../src/backend/scan'
import { listSavedSearches, saveSearch, searchFiles } from '../../src/backend/search'
import { addTags } from '../../src/backend/tags'
import { idOf, memoryDb, NO_OPENINGS, tree } from '../helpers'

const TODAY = '2026-11-04'
const ORIGINS = ['browser', 'whatsapp', 'telegram', 'unknown'] as const

/** 10.000 filas sintéticas directo en el índice: el tiempo que se mide es el de la consulta, no el del disco. */
function syntheticIndex() {
  const db = memoryDb()
  db.exec("INSERT INTO volume(serial_number, mount_path, has_recycle_bin) VALUES ('1', 'C:\\', 1)")
  db.exec("INSERT INTO watched_root(volume_id, path, created_at) VALUES (1, 'C:\\Datos', '2026-01-01')")
  db.exec("INSERT INTO tag(name) VALUES ('facturas'), ('viajes')")
  const insertFile = db.prepare(`INSERT INTO file(volume_id, fs_file_ref, root_id, path, name, extension, size_bytes, modified_at, opened_at, indexed_at)
    VALUES (1, ?, 1, ?, ?, ?, ?, ?, ?, '2026-11-01')`)
  const insertOrigin = db.prepare('INSERT INTO provenance(file_id, origin, confidence, inference_version) VALUES (?, ?, 0.9, 1)')
  const insertTag = db.prepare("INSERT INTO file_tag(file_id, tag_id, source) VALUES (?, ?, 'manual')")
  db.exec('BEGIN')
  for (let index = 1; index <= 10_000; index++) {
    const day = String((index % 28) + 1).padStart(2, '0')
    const month = String((index % 10) + 1).padStart(2, '0')
    const extension = index % 3 === 0 ? 'pdf' : 'jpg'
    insertFile.run(String(index), `C:\\Datos\\archivo-${index}.${extension}`, `archivo-${index}.${extension}`, extension, index * 100, `2026-${month}-${day}T00:00:00Z`, index % 2 ? null : `2026-${month}-${day}T10:00:00Z`)
    insertOrigin.run(index, ORIGINS[index % ORIGINS.length]!)
    if (index % 5 === 0) insertTag.run(index, 1)
  }
  db.exec('COMMIT')
  return db
}

/** P7 · etiquetas y búsqueda combinada (F-15, F-16, F-17). */
describe('búsqueda', () => {
  it('un filtro de 4 condiciones sobre 10.000 filas responde en menos de 200 ms', () => {
    const db = syntheticIndex()
    const filters = SearchFiltersSchema.parse({ origins: ['browser', 'whatsapp'], minDaysUnopened: 90, tags: ['facturas'], extensions: ['PDF'] })
    searchFiles(db, filters, TODAY)
    const started = performance.now()
    const rows = searchFiles(db, filters, TODAY)
    const elapsedMs = performance.now() - started
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(['browser', 'whatsapp']).toContain(row.origin)
      expect(row.extension).toBe('pdf')
      expect(row.tags.map((tag) => tag.name)).toContain('facturas')
      expect((row.openedAt ?? row.modifiedAt) < '2026-08-06').toBe(true)
    }
    expect(elapsedMs).toBeLessThan(200)
  })

  it('el texto busca en nombre, nota y etiqueta; una búsqueda se guarda con nombre', async () => {
    const db = memoryDb()
    await reconcileRoot(db, addRoot(db, tree({ 'arriendo.pdf': 'a', 'otro.txt': 'b', 'tercero.doc': 'c' })), NO_OPENINGS)
    setNote(db, idOf(db, 'otro.txt'), 'pago del arriendo de marzo')
    addTags(db, [idOf(db, 'tercero.doc')], ['arriendos'])
    const filters = SearchFiltersSchema.parse({ text: 'arriendo' })
    expect(searchFiles(db, filters, TODAY).map((row) => row.name)).toEqual(['arriendo.pdf', 'otro.txt', 'tercero.doc'])
    saveSearch(db, 'Arriendo', filters)
    expect(listSavedSearches(db)).toEqual([{ searchId: 1, name: 'Arriendo', filters }])
  })

  it('F-15: exportar y volver a importar las marcas empareja por huella', async () => {
    const folder = tree({ 'a.txt': 'contenido a', 'b.txt': 'contenido b' })
    const source = memoryDb()
    await reconcileRoot(source, addRoot(source, folder), NO_OPENINGS)
    await applyMarks(source, { fileIds: [idOf(source, 'a.txt')], action: 'keep', dueDate: null, expiresOn: '2027-01-01' }, 'conservar')
    setNote(source, idOf(source, 'a.txt'), 'importante')
    addTags(source, [idOf(source, 'b.txt')], ['viajes'])
    const exported = await exportMarks(source)
    expect(exported.files).toHaveLength(2)
    const target = memoryDb()
    await reconcileRoot(target, addRoot(target, folder), NO_OPENINGS)
    expect(await importMarks(target, exported)).toEqual({ matched: 2, unmatched: 0 })
    const [row] = searchFiles(target, SearchFiltersSchema.parse({ actions: ['keep'] }), TODAY)
    expect(row).toMatchObject({ name: 'a.txt', expiresOn: '2027-01-01', note: 'importante' })
  })

  it('una eliminación importada se verifica como una marcada aquí y se puede deshacer', async () => {
    const folder = tree({ 'viejo.log': 'contenido viejo' })
    const source = memoryDb()
    await reconcileRoot(source, addRoot(source, folder), NO_OPENINGS)
    await applyMarks(source, { fileIds: [idOf(source, 'viejo.log')], action: 'deleteOn', dueDate: '2026-01-01', expiresOn: null }, 'eliminar el')
    const exported = await exportMarks(source)
    const target = memoryDb()
    await reconcileRoot(target, addRoot(target, folder), NO_OPENINGS)
    await importMarks(target, exported)
    const fileId = idOf(target, 'viejo.log')
    // sin tamaño ni huella, la pasada diaria la daría por verificada aunque el archivo hubiera cambiado (M-1)
    expect(decisionOf(target, fileId)).toMatchObject({ action: 'deleteOn', size_at_decision: 15 })
    expect(decisionOf(target, fileId)!.content_hash_at_decision).not.toBeNull()
    await undoBatch(target, lastUndoableBatch(target)!, () => undefined, () => undefined)
    expect(fileRow(target, fileId).action).toBe('unreviewed')
  })

  it('el archivo de marcas se lee con BOM y uno ajeno da un error corto', () => {
    const folder = tree({ 'con-bom.json': '﻿{"app":"purga","version":1,"files":[]}', 'ajeno.json': '{"files":null}', 'roto.json': '{' })
    expect(readMarksFile(join(folder, 'con-bom.json')).files).toEqual([])
    expect(() => readMarksFile(join(folder, 'ajeno.json'))).toThrow(/no es una exportación de marcas de Purga/)
    expect(() => readMarksFile(join(folder, 'roto.json'))).toThrow(/no es JSON válido/)
  })
})
