import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { linkTarget, readRecentOpenings } from '../../src/backend/recent'
import { tree } from '../helpers'

const LNK_HEADER_SIZE = 0x4c
const LNK_FLAGS_OFFSET = 0x14
const LNK_HAS_LINK_INFO = 0x2

describe('Recent', () => {
  it('los accesos directos de Recent dan rutas que existen y su fecha de apertura', () => {
    const openings = readRecentOpenings()
    const existing = [...openings.keys()].filter((path) => existsSync(path))
    expect(openings.size).toBeGreaterThan(0)
    expect(existing.length).toBeGreaterThan(0)
    for (const date of openings.values()) expect(date).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('un acceso directo dañado se salta sin detener la lectura de los demás', () => {
    // cabecera válida que anuncia LinkInfo pero termina ahí: leerla se sale del búfer
    const header = Buffer.alloc(LNK_HEADER_SIZE)
    header.writeUInt32LE(LNK_HEADER_SIZE, 0)
    header.writeUInt32LE(LNK_HAS_LINK_INFO, LNK_FLAGS_OFFSET)
    const folder = tree({ 'dañado.lnk': header })
    expect(() => linkTarget(header)).toThrow(RangeError)
    expect(readRecentOpenings(folder).size).toBe(0)
  })
})
