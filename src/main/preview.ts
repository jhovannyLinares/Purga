import { nativeImage } from 'electron'
import { execFile } from 'node:child_process'
import { closeSync, existsSync, openSync, readSync, statSync } from 'node:fs'
import { extname } from 'node:path'
import { promisify } from 'node:util'
import { POWERSHELL_EXE } from '@shared/powershell'
import { TEXT_PREVIEW_LINES, type Preview } from '@shared/preview'

/**
 * Vista previa (F-20) en main, porque las miniaturas de Windows (`IShellItemImageFactory`, las del Explorador) solo
 * se piden desde aquí. Nunca se ejecuta ni se abre el archivo con su programa.
 */
const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']
const TEXT_EXTENSIONS = ['txt', 'md', 'csv', 'log', 'json', 'xml', 'ini', 'yaml', 'yml', 'sql', 'js', 'ts', 'py', 'ps1', 'bat', 'html', 'css']
/** Office y otros formatos que son un .zip por dentro: si Windows no da miniatura, se lista su contenido. */
const ARCHIVE_EXTENSIONS = ['docx', 'xlsx', 'pptx', 'jar', 'apk']
const EXECUTABLE_EXTENSIONS = ['exe', 'msi', 'dll']
/** Una imagen más grande se muestra por su miniatura: pasarla entera por IPC no aporta y pesa. */
const MAX_INLINE_IMAGE_BYTES = 15 * 1024 * 1024
const THUMBNAIL_SIZE = { width: 900, height: 900 }
const TEXT_PREVIEW_BYTES = 64 * 1024
const ARCHIVE_ENTRIES_SHOWN = 200
const MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp' }

export async function previewFile(path: string): Promise<Preview> {
  if (!existsSync(path)) return { kind: 'missing' }
  const extension = extname(path).slice(1).toLowerCase()
  const size = statSync(path).size
  if (IMAGE_EXTENSIONS.includes(extension) && size <= MAX_INLINE_IMAGE_BYTES) {
    return { kind: 'image', dataUrl: `data:${MIME[extension]};base64,${readHead(path, size).toString('base64')}` }
  }
  if (TEXT_EXTENSIONS.includes(extension)) return textPreview(path)
  if (extension === 'zip') return archivePreview(path)
  if (EXECUTABLE_EXTENSIONS.includes(extension)) return executablePreview(path)
  const thumbnail = await windowsThumbnail(path)
  if (extension === 'pdf') return { kind: 'pdf', thumbnail }
  if (thumbnail) return { kind: 'thumbnail', dataUrl: thumbnail }
  if (ARCHIVE_EXTENSIONS.includes(extension)) return archivePreview(path)
  return { kind: 'none' }
}

function readAt(path: string, position: number, bytes: number): Buffer {
  const handle = openSync(path, 'r')
  try {
    const buffer = Buffer.alloc(bytes)
    const read = readSync(handle, buffer, 0, bytes, position)
    return buffer.subarray(0, read)
  } finally {
    closeSync(handle)
  }
}

const readHead = (path: string, bytes: number) => readAt(path, 0, bytes)

async function windowsThumbnail(path: string): Promise<string | null> {
  try {
    const image = await nativeImage.createThumbnailFromPath(path, THUMBNAIL_SIZE)
    return image.isEmpty() ? null : image.toDataURL()
  } catch {
    // Windows no tiene miniatura para ese tipo: se muestra «Sin vista previa»
    return null
  }
}

function textPreview(path: string): Preview {
  const lines = readHead(path, TEXT_PREVIEW_BYTES).toString('utf8').split(/\r?\n/)
  return { kind: 'text', lines: lines.slice(0, TEXT_PREVIEW_LINES), truncated: lines.length > TEXT_PREVIEW_LINES }
}

const END_OF_CENTRAL_DIRECTORY = 0x06054b50
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50
/** El fin del directorio central está en los últimos 22 bytes más un comentario de hasta 64 KB. */
const EOCD_SEARCH_BYTES = 22 + 65_535
/** Alcanza de sobra para las primeras ARCHIVE_ENTRIES_SHOWN entradas, que es lo único que se muestra. */
const MAX_DIRECTORY_BYTES = 4 * 1024 * 1024

/** Lista el contenido de un .zip leyendo su directorio central, sin descomprimir nada. */
function archivePreview(path: string): Preview {
  const size = statSync(path).size
  const tailStart = Math.max(0, size - EOCD_SEARCH_BYTES)
  const tail = readAt(path, tailStart, size - tailStart)
  let eocd = -1
  for (let offset = tail.length - 22; offset >= 0; offset--) {
    if (tail.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY) {
      eocd = offset
      break
    }
  }
  if (eocd < 0) return { kind: 'none' }
  const total = tail.readUInt16LE(eocd + 10)
  const directorySize = tail.readUInt32LE(eocd + 12)
  const directoryOffset = tail.readUInt32LE(eocd + 16)
  // los tamaños vienen del archivo: uno manipulado podría pedir gigas de memoria en el proceso principal
  if (directoryOffset + directorySize > size) return { kind: 'none' }
  const directory = readAt(path, directoryOffset, Math.min(directorySize, MAX_DIRECTORY_BYTES))
  const entries: { name: string; size: number }[] = []
  let offset = 0
  while (offset + 46 <= directory.length && directory.readUInt32LE(offset) === CENTRAL_DIRECTORY_ENTRY && entries.length < ARCHIVE_ENTRIES_SHOWN) {
    const nameLength = directory.readUInt16LE(offset + 28)
    const extraLength = directory.readUInt16LE(offset + 30)
    const commentLength = directory.readUInt16LE(offset + 32)
    entries.push({ name: directory.toString('utf8', offset + 46, offset + 46 + nameLength), size: directory.readUInt32LE(offset + 24) })
    offset += 46 + nameLength + extraLength + commentLength
  }
  return { kind: 'archive', entries, total }
}

const run = promisify(execFile)
const PROPERTIES_TIMEOUT_MS = 15_000

/** Editor, versión y firma de un ejecutable, leídos por PowerShell. El ejecutable nunca corre. */
async function executablePreview(path: string): Promise<Preview> {
  const script = `$i = (Get-Item -LiteralPath $env:PURGA_PREVIEW).VersionInfo; $s = Get-AuthenticodeSignature -LiteralPath $env:PURGA_PREVIEW;
    [pscustomobject]@{ company = [string]$i.CompanyName; product = [string]$i.ProductName; version = [string]$i.FileVersion; signature = "$($s.Status) $($s.SignerCertificate.Subject)" } | ConvertTo-Json -Compress`
  try {
    const { stdout } = await run(POWERSHELL_EXE, ['-NoProfile', '-NonInteractive', '-Command', script], { env: { ...process.env, PURGA_PREVIEW: path }, windowsHide: true, timeout: PROPERTIES_TIMEOUT_MS })
    const properties = JSON.parse(stdout) as { company: string; product: string; version: string; signature: string }
    return { kind: 'executable', ...properties }
  } catch {
    return { kind: 'executable', company: '', product: '', version: '', signature: '' }
  }
}
