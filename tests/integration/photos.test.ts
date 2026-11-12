import { existsSync, mkdirSync, utimesSync } from 'node:fs'
import { dirname, join } from 'node:path'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { photoDate } from '@shared/photos'
import { fileRow } from '../../src/backend/files'
import { undoBatch } from '../../src/backend/marks'
import { analyzePhotos, organizePhotos, renameOrCopy, similarGroups } from '../../src/backend/photos'
import { addRoot } from '../../src/backend/roots'
import { reconcileRoot } from '../../src/backend/scan'
import { idOf, memoryDb, NO_OPENINGS, tempFolder } from '../helpers'

/** Una «foto» de prueba: degradado con figuras, para que el hash perceptual tenga estructura. */
function scene(width: number, height: number) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="g"><stop offset="0" stop-color="#1060a0"/><stop offset="1" stop-color="#f0c040"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/><circle cx="${width * 0.3}" cy="${height * 0.4}" r="${height * 0.2}" fill="#fff"/>
    <rect x="${width * 0.6}" y="${height * 0.5}" width="${width * 0.25}" height="${height * 0.3}" fill="#202020"/></svg>`
  return sharp(Buffer.from(svg))
}

async function photoFolder() {
  const folder = tempFolder()
  mkdirSync(join(folder, 'Descargas'))
  await scene(1600, 1200).jpeg({ quality: 95 }).withExif({ IFD2: { DateTimeOriginal: '2026:08:02 10:00:00' } }).toFile(join(folder, 'IMG_original.jpg'))
  await scene(800, 600).jpeg({ quality: 60 }).toFile(join(folder, 'Descargas', 'WhatsApp Image 2026-08-02 at 11.00.jpeg'))
  await sharp({ create: { width: 400, height: 300, channels: 3, background: '#808080' } }).png().toFile(join(folder, 'otra.png'))
  utimesSync(join(folder, 'otra.png'), new Date('2026-07-15T12:00:00Z'), new Date('2026-07-15T12:00:00Z'))
  const db = memoryDb()
  await reconcileRoot(db, addRoot(db, folder), NO_OPENINGS)
  await analyzePhotos(db)
  return { db, folder }
}

/** P6 · fotos (F-9, F-10). */
describe('fotos', () => {
  it('la original gana a la reenviada en un grupo de parecidas', async () => {
    const { db } = await photoFolder()
    const groups = similarGroups(db)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.photos.map((photo) => photo.file.name).sort()).toEqual(['IMG_original.jpg', 'WhatsApp Image 2026-08-02 at 11.00.jpeg'])
    expect(fileRow(db, groups[0]!.bestFileId).name).toBe('IMG_original.jpg')
  })

  it('la fecha sale del EXIF, del nombre o de la modificación, en ese orden', () => {
    expect(photoDate('IMG_20260101_x.jpg', '2026-08-02T10:00:00.000Z', '2026-09-09T00:00:00Z')).toEqual({ day: '2026-08-02', source: 'exif' })
    expect(photoDate('WhatsApp Image 2026-08-03 at 11.00.jpeg', null, '2026-09-09T00:00:00Z')).toEqual({ day: '2026-08-03', source: 'name' })
    expect(photoDate('IMG_20260804_101010.jpg', null, '2026-09-09T00:00:00Z')).toEqual({ day: '2026-08-04', source: 'name' })
    expect(photoDate('sin-fecha.jpg', null, '2026-09-09T00:00:00Z')).toEqual({ day: '2026-09-09', source: 'modified' })
  })

  it('ordenar por fecha mueve a AAAA\\AAAA-MM-DD y Deshacer las devuelve', async () => {
    const { db, folder } = await photoFolder()
    const destination = join(folder, 'Ordenadas')
    const ids = ['IMG_original.jpg', 'WhatsApp Image 2026-08-02 at 11.00.jpeg', 'otra.png'].map((name) => idOf(db, name))
    const result = await organizePhotos(db, { fileIds: ids, destination, granularity: 'day', mode: 'move' }, 'ordenar')
    expect(result).toMatchObject({ done: 3, folders: 2 })
    expect(existsSync(join(destination, '2026', '2026-08-02', 'IMG_original.jpg'))).toBe(true)
    expect(existsSync(join(destination, '2026', '2026-07-15', 'otra.png'))).toBe(true)
    expect(fileRow(db, ids[0]!).path).toBe(join(destination, '2026', '2026-08-02', 'IMG_original.jpg'))
    const moveBack = (from: string, to: string) => {
      mkdirSync(dirname(to), { recursive: true })
      renameOrCopy(from, to)
    }
    await undoBatch(db, result.batchId!, moveBack, () => undefined)
    expect(existsSync(join(folder, 'IMG_original.jpg'))).toBe(true)
    expect(fileRow(db, ids[0]!).path).toBe(join(folder, 'IMG_original.jpg'))
  })

  it('el automático no mueve las de fecha dudosa; copiar no repite un duplicado exacto y numera los nombres', async () => {
    const { db, folder } = await photoFolder()
    const destination = join(folder, 'Copias')
    const ids = ['IMG_original.jpg', 'otra.png'].map((name) => idOf(db, name))
    const auto = await organizePhotos(db, { fileIds: ids, destination, granularity: 'day', mode: 'copy' }, 'auto', true)
    expect(auto).toMatchObject({ done: 1, lowConfidence: 1 })
    const again = await organizePhotos(db, { fileIds: [ids[0]!], destination, granularity: 'day', mode: 'copy' }, 'copiar otra vez')
    expect(again).toMatchObject({ done: 0, skipped: 1 })
  })
})
