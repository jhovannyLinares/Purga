import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { logError } from './log'

/**
 * Última apertura (F-3): Windows casi nunca registra el acceso, pero deja un acceso directo en Recent cada vez que se
 * abre un archivo. La fecha del `.lnk` es la de la última apertura; su destino sale del bloque LinkInfo
 * ([MS-SHLLINK] §2.3). Las Jump Lists no se leen en v1.
 */
export function recentFolder(): string {
  return join(process.env.APPDATA ?? '', 'Microsoft', 'Windows', 'Recent')
}

/** Ruta en minúscula → fecha ISO de la última apertura. */
export function readRecentOpenings(folder = recentFolder()): Map<string, string> {
  const openings = new Map<string, string>()
  let entries: string[]
  try {
    entries = readdirSync(folder).filter((name) => name.toLowerCase().endsWith('.lnk'))
  } catch (error) {
    logError('recent.read', error, folder)
    return openings
  }
  for (const entry of entries) {
    const lnk = join(folder, entry)
    let target: string | null
    let openedAt: string
    try {
      target = linkTarget(readFileSync(lnk))
      openedAt = statSync(lnk).mtime.toISOString()
    } catch (error) {
      // un acceso directo dañado o a medio escribir no puede detener la lectura de los demás
      logError('recent.link', error, lnk)
      continue
    }
    if (!target) continue
    const key = target.toLowerCase()
    const previous = openings.get(key)
    if (!previous || previous < openedAt) openings.set(key, openedAt)
  }
  return openings
}

const HEADER_SIZE = 0x4c
const HAS_TARGET_ID_LIST = 0x1
const HAS_LINK_INFO = 0x2
const VOLUME_ID_AND_LOCAL_BASE_PATH = 0x1
/** Desde este tamaño de cabecera, LinkInfo trae también las rutas en Unicode. */
const UNICODE_HEADER_SIZE = 0x24

/** Destino local de un `.lnk`, o null si apunta a otra cosa (carpeta de red, elemento del shell). */
export function linkTarget(data: Buffer): string | null {
  if (data.length < HEADER_SIZE || data.readUInt32LE(0) !== HEADER_SIZE) return null
  const flags = data.readUInt32LE(0x14)
  if (!(flags & HAS_LINK_INFO)) return null
  let offset = HEADER_SIZE
  if (flags & HAS_TARGET_ID_LIST) offset += 2 + data.readUInt16LE(offset)
  const info = offset
  const headerSize = data.readUInt32LE(info + 4)
  const infoFlags = data.readUInt32LE(info + 8)
  if (!(infoFlags & VOLUME_ID_AND_LOCAL_BASE_PATH)) return null
  if (headerSize >= UNICODE_HEADER_SIZE) {
    const base = readUtf16(data, info + data.readUInt32LE(info + 28))
    const suffix = readUtf16(data, info + data.readUInt32LE(info + 32))
    return base + suffix
  }
  return readAnsi(data, info + data.readUInt32LE(info + 16)) + readAnsi(data, info + data.readUInt32LE(info + 24))
}

function readAnsi(data: Buffer, start: number): string {
  const end = data.indexOf(0, start)
  return data.toString('latin1', start, end < 0 ? data.length : end)
}

function readUtf16(data: Buffer, start: number): string {
  let end = start
  while (end + 1 < data.length && data.readUInt16LE(end) !== 0) end += 2
  return data.toString('utf16le', start, end)
}
