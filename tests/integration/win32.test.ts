import { mkdtempSync, realpathSync, renameSync, statSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, parse } from 'node:path'
import { describe, expect, it } from 'vitest'
import { hasRecycleBin, pathByFileId } from '../../src/backend/win32'

describe('win32', () => {
  it('encuentra un archivo movido por su File ID, sin administrador', () => {
    const dir = mkdtempSync(join(tmpdir(), 'purga-id-'))
    const first = join(dir, 'a.txt')
    writeFileSync(first, 'hola')
    const fileId = statSync(first, { bigint: true }).ino
    mkdirSync(join(dir, 'sub'))
    const moved = join(dir, 'sub', 'renombrado.txt')
    renameSync(first, moved)
    expect(pathByFileId(parse(dir).root, fileId)?.toLowerCase()).toBe(realpathSync.native(moved).toLowerCase())
  })
  it('un File ID que no existe da null', () => {
    expect(pathByFileId(parse(tmpdir()).root, 0x7fffffffffffn)).toBeNull()
  })
  it('el disco del sistema tiene Papelera', () => {
    expect(hasRecycleBin(tmpdir())).toBe(true)
  })
})
