import { describe, expect, it } from 'vitest'
import { COLUMN_SPECS, gridTemplate, minTableWidth, readLayout, resetColumnWidth, resizeColumn, toggleColumn, visibleColumns } from '@shared/table-columns'

describe('columnas a elección', () => {
  it('sin elección guardada, cada tabla trae sus columnas de fábrica', () => {
    expect(visibleColumns('explore', {})).toEqual(['name', 'origin', 'activity', 'size', 'mark'])
    expect(visibleColumns('proposals', {})).toEqual(['name', 'rule', 'size'])
  })

  it('prender una columna la pone en su lugar de la tabla, no al final', () => {
    const layout = toggleColumn('explore', {}, 'kind', true)
    expect(visibleColumns('explore', layout)).toEqual(['name', 'kind', 'origin', 'activity', 'size', 'mark'])
  })

  it('la que siempre se ve no se puede apagar, ni aunque la elección guardada la omita', () => {
    expect(toggleColumn('explore', {}, 'name', false)).toEqual({})
    expect(visibleColumns('explore', { visible: ['size'] })).toEqual(['name', 'size'])
  })

  it('el ancho nunca baja del mínimo y doble clic vuelve al de fábrica', () => {
    const narrow = resizeColumn({}, 'mark', 10)
    expect(narrow.widths?.mark).toBe(COLUMN_SPECS.mark.min)
    expect(resetColumnWidth(narrow, 'mark').widths?.mark).toBeUndefined()
  })

  it('la columna que siempre se ve toma el sobrante; las fijas van en px', () => {
    expect(gridTemplate('proposals', {}, { tail: 150 })).toBe('minmax(136px, 1fr) 170px 84px 150px')
    expect(gridTemplate('explore', {}, { lead: 28, tail: 40 })).toBe('28px minmax(136px, 1fr) 80px 100px 84px 130px 40px')
  })

  it('ajustar Nombre la deja en ese ancho: el sobrante pasa al final, antes del ⋮', () => {
    const narrower = resizeColumn({}, 'name', 125)
    expect(gridTemplate('proposals', narrower, { tail: 150 })).toBe('125px 170px 84px minmax(150px, 1fr)')
    // doble clic: vuelve a tomar el sobrante
    expect(gridTemplate('proposals', resetColumnWidth(narrower, 'name'), { tail: 150 })).toBe('minmax(136px, 1fr) 170px 84px 150px')
  })

  it('el mínimo de la tabla suma columnas, espacios entre ellas y margen de la fila', () => {
    // 28 + 136 + 80 + 100 + 84 + 130 + 40 = 598; 6 espacios de 12; 32 de margen
    expect(minTableWidth('explore', {}, { lead: 28, tail: 40 })).toBe(598 + 72 + 32)
  })
})

describe('elección guardada que viene rota', () => {
  it('una columna que no existe, un ancho negativo o un texto suelto vuelven a lo de fábrica', () => {
    for (const raw of [{ visible: ['inventada'] }, { widths: { mark: -5 } }, 'basura', null]) {
      expect(readLayout(raw)).toEqual({ layout: {}, broken: true })
    }
  })

  it('sin nada guardado no es un error', () => {
    expect(readLayout(undefined)).toEqual({ layout: {}, broken: false })
  })

  it('una elección válida se lee tal cual', () => {
    expect(readLayout({ visible: ['name', 'kind'], widths: { kind: 200 } })).toEqual({ layout: { visible: ['name', 'kind'], widths: { kind: 200 } }, broken: false })
  })
})
