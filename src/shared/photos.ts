import { z } from 'zod'
import { FileRowSchema } from './model'

/** Fotos parecidas y orden por fecha (F-9, F-10). Lo que no depende del disco vive aquí y se prueba solo. */

export const PHOTO_EXTENSIONS = ['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'tif', 'tiff', 'dng', 'cr2', 'nef', 'arw']
const RAW_EXTENSIONS = ['dng', 'cr2', 'nef', 'arw']

/** Distancia de Hamming entre hashes perceptuales a partir de la cual dos fotos son distintas. */
export const SIMILAR_MAX_DISTANCE = 8

export const DateSourceSchema = z.enum(['exif', 'name', 'modified'])
export type DateSource = z.infer<typeof DateSourceSchema>

/** `IMG_20260802_…`, `WhatsApp Image 2026-08-02 at …`, `PXL_20260802_…`, `Screenshot_2026-08-02…`. */
const NAME_DATE = /(?:^|[^0-9])(20\d{2}|19\d{2})[-_]?(0[1-9]|1[0-2])[-_]?(0[1-9]|[12]\d|3[01])(?:[^0-9]|$)/

/** Fecha de una foto: EXIF › patrón del nombre › modificación (confianza baja). */
export function photoDate(name: string, exifDate: string | null, modifiedAt: string): { day: string; source: DateSource } {
  if (exifDate) return { day: exifDate.slice(0, 10), source: 'exif' }
  const match = name.match(NAME_DATE)
  if (match) return { day: `${match[1]}-${match[2]}-${match[3]}`, source: 'name' }
  return { day: modifiedAt.slice(0, 10), source: 'modified' }
}

export const GranularitySchema = z.enum(['year', 'month', 'day'])
export type Granularity = z.infer<typeof GranularitySchema>

/** `AAAA`, `AAAA\AAAA-MM` o `AAAA\AAAA-MM-DD`, relativo al destino. */
export function dateFolder(day: string, granularity: Granularity): string {
  const year = day.slice(0, 4)
  if (granularity === 'year') return year
  return `${year}\\${granularity === 'month' ? day.slice(0, 7) : day}`
}

export interface PhotoQuality {
  fileId: number
  width: number
  height: number
  extension: string
  jpegQuality: number | null
  hasExif: boolean
  sharpness: number | null
  modifiedAt: string
}

/** RAW > HEIC/PNG > JPEG y el resto. */
function formatRank(extension: string): number {
  if (RAW_EXTENSIONS.includes(extension)) return 3
  if (['heic', 'heif', 'png', 'tif', 'tiff'].includes(extension)) return 2
  if (['jpg', 'jpeg'].includes(extension)) return 1
  return 0
}

/**
 * La mejor de un grupo (F-9), por este orden: más píxeles › menos compresión (formato, y en JPEG la calidad de sus
 * tablas) › EXIF original › más nítida › más antigua.
 */
export function bestPhoto(photos: PhotoQuality[]): number {
  const ranked = [...photos].sort(
    (left, right) =>
      right.width * right.height - left.width * left.height ||
      formatRank(right.extension) - formatRank(left.extension) ||
      (right.jpegQuality ?? 0) - (left.jpegQuality ?? 0) ||
      Number(right.hasExif) - Number(left.hasExif) ||
      (right.sharpness ?? 0) - (left.sharpness ?? 0) ||
      left.modifiedAt.localeCompare(right.modifiedAt)
  )
  return ranked[0]!.fileId
}

export const PhotoInfoSchema = z.object({
  file: FileRowSchema,
  width: z.number(),
  height: z.number(),
  jpegQuality: z.number().nullable(),
  hasExif: z.boolean(),
  day: z.string(),
  dateSource: DateSourceSchema
})
export type PhotoInfo = z.infer<typeof PhotoInfoSchema>

export const SimilarGroupSchema = z.object({ groupKey: z.string(), bestFileId: z.number(), chosenFileId: z.number(), photos: z.array(PhotoInfoSchema) })
export type SimilarGroup = z.infer<typeof SimilarGroupSchema>

export const OrganizeRequestSchema = z.object({
  fileIds: z.array(z.number()).min(1),
  destination: z.string().min(1),
  granularity: GranularitySchema,
  mode: z.enum(['move', 'copy'])
})
export type OrganizeRequest = z.infer<typeof OrganizeRequestSchema>

export const OrganizeResultSchema = z.object({ batchId: z.number().nullable(), done: z.number(), skipped: z.number(), lowConfidence: z.number(), bytes: z.number(), folders: z.number() })
export type OrganizeResult = z.infer<typeof OrganizeResultSchema>
