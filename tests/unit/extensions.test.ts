import { describe, expect, it } from 'vitest'
import { extensionOf, isIncluded } from '@shared/extensions'

describe('extensión de un archivo', () => {
  it('es lo que sigue al último punto, en minúscula', () => {
    expect(extensionOf('Informe.PDF')).toBe('pdf')
    expect(extensionOf('respaldo.config.json')).toBe('json')
  })

  it('un nombre que empieza por punto tiene extensión, como en el Explorador de Windows', () => {
    expect(extensionOf('.gitignore')).toBe('gitignore')
    expect(extensionOf('.gitattributes')).toBe('gitattributes')
    expect(extensionOf('.eslintrc.json')).toBe('json')
  })

  it('sin punto no hay extensión', () => {
    expect(extensionOf('LICENSE')).toBe('')
  })

  it('la extensión doble cuenta solo si está declarada', () => {
    expect(extensionOf('datos.tar.gz', ['tar.gz'])).toBe('tar.gz')
    expect(extensionOf('datos.tar.gz')).toBe('gz')
  })

  it('una regla global «.gitignore» deja fuera los .gitignore', () => {
    expect(isIncluded(extensionOf('.gitignore'), { mode: 'deny', extensions: ['.gitignore'] })).toBe(false)
  })
})
