import exifr from 'exifr'
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { open } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import sharp from 'sharp'
import phash from 'sharp-phash'
import distance from 'sharp-phash/distance'
import { bestPhoto, dateFolder, photoDate, PHOTO_EXTENSIONS, SIMILAR_MAX_DISTANCE, type DateSource, type OrganizeRequest, type OrganizeResult, type PhotoInfo, type SimilarGroup } from '@shared/photos'
import { transaction, type Database } from './db'
import { selectRows } from './files'
import { fullHash } from './hashing'
import { logError } from './log'
import { createBatch } from './marks'

/** Fotos (F-9, F-10, §5.4): análisis con caché por versión del archivo, grupos de parecidas y orden por fecha. */

const PHOTO_EXTENSIONS_SQL = PHOTO_EXTENSIONS.map((extension) => `'${extension}'`).join(', ')

interface PhotoRecord {
  file_id: number
  width: number
  height: number
  format: string
  jpeg_quality: number | null
  has_exif: number
  taken_at: string | null
  date_source: DateSource
  phash: string | null
  sharpness: number | null
}

/** Analiza las fotos nuevas o cambiadas; las ya analizadas en su versión actual no se vuelven a leer. */
export async function analyzePhotos(db: Database): Promise<number> {
  const pending = db.prepare(`SELECT f.file_id, f.path, f.name, f.modified_at FROM file f LEFT JOIN photo p USING (file_id)
    WHERE f.presence = 'present' AND f.extension IN (${PHOTO_EXTENSIONS_SQL}) AND (p.file_id IS NULL OR p.analyzed_modified_at <> f.modified_at)`).all() as { file_id: number; path: string; name: string; modified_at: string }[]
  for (const file of pending) {
    // se guarda antes sin analizar: si una imagen dañada tumba el proceso al decodificarla, al reiniciar ya
    // figura analizada y no se vuelve a intentar en bucle
    savePhoto(db, file, undecodedRecord(file))
    const record = await analyzePhoto(file.path, file.name, file.modified_at).catch((error: unknown) => {
      // formato que sharp no decodifica (RAW, HEIC): queda con la fecha y sin hash, fuera de las parecidas
      logError('photo.analyze', error, `archivo ${file.file_id}`)
      return undecodedRecord(file)
    })
    savePhoto(db, file, record)
  }
  return pending.length
}

type PendingPhoto = { file_id: number; name: string; modified_at: string }

function undecodedRecord(file: PendingPhoto): Omit<PhotoRecord, 'file_id'> {
  return { width: 0, height: 0, format: extname(file.name).slice(1).toLowerCase(), jpeg_quality: null, has_exif: 0, ...dateRecord(file.name, null, file.modified_at), phash: null, sharpness: null }
}

function savePhoto(db: Database, file: PendingPhoto, record: Omit<PhotoRecord, 'file_id'>): void {
  db.prepare(`INSERT OR REPLACE INTO photo(file_id, analyzed_modified_at, width, height, format, jpeg_quality, has_exif, taken_at, date_source, phash, sharpness)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(file.file_id, file.modified_at, record.width, record.height, record.format, record.jpeg_quality, record.has_exif, record.taken_at, record.date_source, record.phash, record.sharpness)
}

function dateRecord(name: string, exifDate: string | null, modifiedAt: string) {
  const date = photoDate(name, exifDate, modifiedAt)
  return { taken_at: date.day, date_source: date.source }
}

async function analyzePhoto(path: string, name: string, modifiedAt: string): Promise<Omit<PhotoRecord, 'file_id'>> {
  const image = sharp(path)
  const metadata = await image.metadata()
  const stats = await image.stats()
  const exif = (await exifr.parse(path, ['DateTimeOriginal']).catch(() => null)) as { DateTimeOriginal?: Date } | null | undefined
  const exifDate = exif?.DateTimeOriginal instanceof Date ? exif.DateTimeOriginal.toISOString() : null
  const format = metadata.format ?? extname(name).slice(1).toLowerCase()
  return {
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
    format,
    jpeg_quality: format === 'jpeg' ? await jpegQuality(path) : null,
    has_exif: metadata.exif ? 1 : 0,
    ...dateRecord(name, exifDate, modifiedAt),
    phash: await phash(path),
    sharpness: stats.sharpness
  }
}

/** Tabla de luminancia estándar de JPEG (IJG, calidad 50): la calidad sale de cuánto se escaló. */
const STANDARD_LUMINANCE = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99]
const JPEG_HEADER_BYTES = 64 * 1024
const DQT_MARKER = 0xdb
const STANDARD_TABLE_SUM = STANDARD_LUMINANCE.reduce((total, value) => total + value, 0)

/** Calidad aproximada de un JPEG (1–100) por su primera tabla de cuantización; null si no se encuentra. */
export async function jpegQuality(path: string): Promise<number | null> {
  const handle = await open(path, 'r')
  try {
    const header = Buffer.alloc(JPEG_HEADER_BYTES)
    const { bytesRead } = await handle.read(header, 0, header.length, 0)
    return qualityFromHeader(header.subarray(0, bytesRead))
  } finally {
    await handle.close()
  }
}

export function qualityFromHeader(data: Buffer): number | null {
  let offset = 2
  while (offset + 4 < data.length && data[offset] === 0xff) {
    const marker = data[offset + 1]!
    const length = data.readUInt16BE(offset + 2)
    if (marker === DQT_MARKER) {
      const precision = data[offset + 4]! >> 4
      const table = data.subarray(offset + 5, offset + 5 + (precision ? 128 : 64))
      const values = precision ? Array.from({ length: 64 }, (_, index) => table.readUInt16BE(index * 2)) : Array.from(table)
      const scale = (values.reduce((total, value) => total + value, 0) * 100) / STANDARD_TABLE_SUM
      const quality = scale <= 100 ? (200 - scale) / 2 : 5000 / scale
      return Math.max(1, Math.min(100, Math.round(quality)))
    }
    offset += 2 + length
  }
  return null
}

function photoInfos(db: Database, where: string, params: (string | number)[]): PhotoInfo[] {
  const rows = selectRows(db, `f.extension IN (${PHOTO_EXTENSIONS_SQL}) AND f.presence = 'present' AND ${where}`, params, 'f.modified_at', 1_000_000)
  const records = new Map((db.prepare(`SELECT * FROM photo WHERE file_id IN (SELECT value FROM json_each(?))`).all(JSON.stringify(rows.map((row) => row.fileId))) as unknown as PhotoRecord[]).map((record) => [record.file_id, record]))
  return rows.flatMap((file) => {
    const record = records.get(file.fileId)
    if (!record) return []
    return [{ file, width: record.width, height: record.height, jpegQuality: record.jpeg_quality, hasExif: record.has_exif === 1, day: record.taken_at ?? file.modifiedAt.slice(0, 10), dateSource: record.date_source }]
  })
}

/** Grupos de fotos parecidas: distancia de Hamming ≤ 8, unidos por cercanía (unión de conjuntos). */
export function similarGroups(db: Database): SimilarGroup[] {
  const hashed = db.prepare("SELECT p.file_id, p.phash, p.sharpness FROM photo p JOIN file f USING (file_id) WHERE p.phash IS NOT NULL AND f.presence = 'present'").all() as { file_id: number; phash: string; sharpness: number | null }[]
  const parent = new Map(hashed.map((photo) => [photo.file_id, photo.file_id]))
  const find = (id: number): number => {
    const up = parent.get(id)!
    if (up === id) return id
    const root = find(up)
    parent.set(id, root)
    return root
  }
  for (let left = 0; left < hashed.length; left++) {
    for (let right = left + 1; right < hashed.length; right++) {
      if (distance(hashed[left]!.phash, hashed[right]!.phash) <= SIMILAR_MAX_DISTANCE) parent.set(find(hashed[left]!.file_id), find(hashed[right]!.file_id))
    }
  }
  const members = new Map<number, number[]>()
  for (const photo of hashed) members.set(find(photo.file_id), [...(members.get(find(photo.file_id)) ?? []), photo.file_id])
  const sharpness = new Map(hashed.map((photo) => [photo.file_id, photo.sharpness]))
  const groups: SimilarGroup[] = []
  for (const ids of members.values()) {
    if (ids.length < 2) continue
    const photos = photoInfos(db, 'f.file_id IN (SELECT value FROM json_each(?))', [JSON.stringify(ids)])
    if (photos.length < 2) continue
    const groupKey = [...ids].sort((left, right) => left - right).join(',')
    const best = bestPhoto(photos.map((photo) => ({ fileId: photo.file.fileId, width: photo.width, height: photo.height, extension: photo.file.extension, jpegQuality: photo.jpegQuality, hasExif: photo.hasExif, sharpness: sharpness.get(photo.file.fileId) ?? null, modifiedAt: photo.file.modifiedAt })))
    const preferred = db.prepare('SELECT preferred_file_id FROM photo_preference WHERE group_key = ?').get(groupKey) as { preferred_file_id: number } | undefined
    groups.push({ groupKey, bestFileId: best, chosenFileId: preferred?.preferred_file_id ?? best, photos })
  }
  return groups
}

export function preferPhoto(db: Database, groupKey: string, fileId: number): void {
  db.prepare('INSERT OR REPLACE INTO photo_preference(group_key, preferred_file_id) VALUES (?, ?)').run(groupKey, fileId)
}

/** Fotos sin ordenar de una carpeta, con su fecha y de dónde salió. */
export function photosOfRoot(db: Database, rootId: number): PhotoInfo[] {
  return photoInfos(db, 'f.root_id = ?', [rootId])
}

/** Nombre libre en la carpeta: `foto.jpg`, `foto (1).jpg`, `foto (2).jpg`… */
function freeName(folder: string, name: string): string {
  const extension = extname(name)
  const stem = basename(name, extension)
  let candidate = join(folder, name)
  for (let copy = 1; existsSync(candidate); copy++) candidate = join(folder, `${stem} (${copy})${extension}`)
  return candidate
}

/** Si en la carpeta de destino ya hay un archivo idéntico, no se copia ni se mueve otro. */
async function identicalInFolder(folder: string, path: string, size: number): Promise<boolean> {
  const sameName = join(folder, basename(path))
  if (!existsSync(sameName) || statSync(sameName).size !== size) return false
  return (await fullHash(sameName)) === (await fullHash(path))
}

/**
 * Mueve o copia a `{destino}\AAAA\AAAA-MM-DD` (F-10), en un lote con Deshacer. Con `onlyConfident`, las fotos cuya
 * fecha salió de la modificación no se mueven: se cuentan para proponerlas.
 */
export async function organizePhotos(db: Database, request: OrganizeRequest, description: string, onlyConfident = false): Promise<OrganizeResult> {
  const photos = photoInfos(db, 'f.file_id IN (SELECT value FROM json_each(?))', [JSON.stringify(request.fileIds)])
  const result: OrganizeResult = { batchId: null, done: 0, skipped: 0, lowConfidence: 0, bytes: 0, folders: 0 }
  const folders = new Set<string>()
  const actions: { fileId: number; from: string; to: string }[] = []
  for (const photo of photos) {
    if (onlyConfident && photo.dateSource === 'modified') {
      result.lowConfidence++
      continue
    }
    const folder = join(request.destination, dateFolder(photo.day, request.granularity))
    if (photo.file.path.toLowerCase().startsWith(folder.toLowerCase() + '\\')) continue
    mkdirSync(folder, { recursive: true })
    if (await identicalInFolder(folder, photo.file.path, photo.file.sizeBytes)) {
      result.skipped++
      continue
    }
    const target = freeName(folder, photo.file.name)
    if (request.mode === 'move') renameOrCopy(photo.file.path, target)
    else copyFileSync(photo.file.path, target)
    folders.add(folder)
    actions.push({ fileId: photo.file.fileId, from: photo.file.path, to: target })
    result.done++
    result.bytes += photo.file.sizeBytes
  }
  result.folders = folders.size
  if (actions.length === 0) return result
  result.batchId = transaction(db, () => {
    const batchId = createBatch(db, description)
    const insert = db.prepare('INSERT INTO batch_item(batch_id, file_id, moved_from, moved_to, copied_to) VALUES (?, ?, ?, ?, ?)')
    for (const action of actions) {
      if (request.mode === 'move') {
        insert.run(batchId, action.fileId, action.from, action.to, null)
        db.prepare('UPDATE file SET path = ?, name = ? WHERE file_id = ?').run(action.to, basename(action.to), action.fileId)
        db.prepare("UPDATE rule_match SET resolution = 'accepted' WHERE rule_id = 'F-10' AND file_id = ?").run(action.fileId)
      } else {
        insert.run(batchId, action.fileId, null, null, action.to)
      }
    }
    return batchId
  })
  return result
}

/** Mover entre discos no se puede renombrar: se copia y se borra el original. */
export function renameOrCopy(from: string, to: string): void {
  try {
    renameSync(from, to)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EXDEV') throw error
    // el original solo se quita cuando la copia ya existe
    copyFileSync(from, to)
    rmSync(from)
  }
}
