import { describe, expect, it } from 'vitest'
import { activityPercent, activityTone, BAR_MIN_PERCENT, nextSort, sortFiles, type SortValues } from '@shared/file-order'
import type { FileRow } from '@shared/model'

function fileRow(name: string, sizeBytes: number, idle: number, origin = 'browser', action = 'unreviewed'): FileRow {
  return { name, sizeBytes, idle, origin, action } as unknown as FileRow
}

const values: SortValues = {
  idleDays: (file) => (file as unknown as { idle: number }).idle,
  originLabel: (file) => file.origin,
  markLabel: (file) => file.action
}

const files = [fileRow('beta.pdf', 10, 400), fileRow('Alfa.txt', 3000, 5, 'whatsapp', 'keep'), fileRow('gamma 10.doc', 200, 90, 'outlook', 'delete'), fileRow('gamma 9.doc', 200, 90)]
const names = (rows: FileRow[]) => rows.map((row) => row.name)

describe('orden de la tabla de archivos', () => {
  it('sin orden elegido deja la lista como llegó', () => {
    expect(sortFiles(files, null, values, 'es')).toBe(files)
  })

  it('el primer clic en actividad pone primero lo más inactivo; el segundo lo invierte', () => {
    const first = nextSort(null, 'activity')
    expect(first).toEqual({ key: 'activity', direction: 'desc' })
    expect(names(sortFiles(files, first, values, 'es'))[0]).toBe('beta.pdf')
    const second = nextSort(first, 'activity')
    expect(names(sortFiles(files, second, values, 'es'))[0]).toBe('Alfa.txt')
  })

  it('cambiar de columna vuelve al sentido natural de la nueva', () => {
    expect(nextSort({ key: 'activity', direction: 'asc' }, 'size')).toEqual({ key: 'size', direction: 'desc' })
    expect(nextSort({ key: 'size', direction: 'desc' }, 'name')).toEqual({ key: 'name', direction: 'asc' })
  })

  it('tamaño desc pone lo más grande primero', () => {
    expect(names(sortFiles(files, { key: 'size', direction: 'desc' }, values, 'es'))[0]).toBe('Alfa.txt')
  })

  it('nombre ignora mayúsculas y compara números como números', () => {
    expect(names(sortFiles(files, { key: 'name', direction: 'asc' }, values, 'es'))).toEqual(['Alfa.txt', 'beta.pdf', 'gamma 9.doc', 'gamma 10.doc'])
  })

  it('no modifica la lista original', () => {
    const before = names(files)
    sortFiles(files, { key: 'size', direction: 'asc' }, values, 'es')
    expect(names(files)).toEqual(before)
  })
})

describe('barra de actividad', () => {
  it('el tono cambia en los cortes de 30 y 180 días', () => {
    expect([0, 30, 31, 180, 181].map(activityTone)).toEqual(['ok', 'ok', 'warn', 'warn', 'err'])
  })

  it('crece con los días, se llena al año y nunca baja del mínimo visible', () => {
    expect(activityPercent(0)).toBe(BAR_MIN_PERCENT)
    expect(activityPercent(365)).toBe(100)
    expect(activityPercent(5000)).toBe(100)
    expect(activityPercent(73)).toBeCloseTo(20)
  })
})
