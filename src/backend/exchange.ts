import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { DaySchema, MarkActionSchema } from '@shared/model'
import { transaction, type Database } from './db'
import { decisionOf, emptyDecision, writeDecision } from './decisions'
import { fullHash, partialHash } from './hashing'
import { logError } from './log'
import { createBatch, recordItem } from './marks'
import { addTags } from './tags'

/** Exportar e importar marcas (F-15): JSON con ruta, huella, marca, nota y etiquetas; al importar se empareja por huella. */

export const MarksFileSchema = z.object({
  app: z.literal('purga'),
  version: z.literal(1),
  files: z.array(z.object({
    path: z.string(),
    hash: z.string(),
    size: z.number(),
    action: MarkActionSchema,
    dueDate: DaySchema.nullable(),
    expiresOn: DaySchema.nullable(),
    note: z.string(),
    tags: z.array(z.string())
  }))
})
export type MarksFile = z.infer<typeof MarksFileSchema>

/** Notepad y PowerShell 5.1 guardan el JSON con BOM; JSON.parse no lo acepta. */
const UTF8_BOM = '﻿'

/** El archivo de marcas, o un error corto que la interfaz traduce: el detalle de zod no le sirve a nadie. */
export function readMarksFile(path: string): MarksFile {
  const text = readFileSync(path, 'utf8')
  let data: unknown
  try {
    data = JSON.parse(text.startsWith(UTF8_BOM) ? text.slice(1) : text)
  } catch {
    throw new Error(`${path} no es JSON válido`)
  }
  const parsed = MarksFileSchema.safeParse(data)
  if (!parsed.success) throw new Error(`${path} no es una exportación de marcas de Purga versión 1`)
  return parsed.data
}

interface MarkedFile {
  file_id: number
  path: string
  size_bytes: number
}

async function hashOf(db: Database, file: MarkedFile): Promise<string | null> {
  const stored = db.prepare('SELECT c.full_hash FROM file f JOIN content c USING (content_id) WHERE f.file_id = ?').get(file.file_id) as { full_hash: string } | undefined
  if (stored) return stored.full_hash
  try {
    return await fullHash(file.path)
  } catch (error) {
    logError('export.hash', error, `archivo ${file.file_id}`)
    return null
  }
}

export async function exportMarks(db: Database): Promise<MarksFile> {
  const marked = db.prepare(`SELECT f.file_id, f.path, f.size_bytes FROM file f WHERE f.presence IN ('present', 'filtered_out') AND
    (f.file_id IN (SELECT file_id FROM file_decision WHERE action <> 'unreviewed' OR note <> '') OR f.file_id IN (SELECT file_id FROM file_tag WHERE source = 'manual'))`).all() as unknown as MarkedFile[]
  const files: MarksFile['files'] = []
  for (const file of marked) {
    const hash = await hashOf(db, file)
    if (!hash) continue
    const decision = decisionOf(db, file.file_id)
    const tags = (db.prepare("SELECT t.name FROM file_tag ft JOIN tag t USING (tag_id) WHERE ft.file_id = ? AND ft.source = 'manual'").all(file.file_id) as { name: string }[]).map((row) => row.name)
    files.push({ path: file.path, hash, size: file.size_bytes, action: decision?.action ?? 'unreviewed', dueDate: decision?.due_date ?? null, expiresOn: decision?.expires_on ?? null, note: decision?.note ?? '', tags })
  }
  return { app: 'purga', version: 1, files }
}

/** Empareja por huella entre los archivos indexados del mismo tamaño. Devuelve cuántos emparejó y cuántos no. */
export async function importMarks(db: Database, data: MarksFile): Promise<{ matched: number; unmatched: number }> {
  let matched = 0
  const byHash = new Map(data.files.map((entry) => [entry.hash, entry]))
  // solo se leen los archivos con el tamaño de alguno de la lista
  const sizes = JSON.stringify([...new Set(data.files.map((entry) => entry.size))])
  const candidates = db.prepare("SELECT file_id, path, size_bytes FROM file WHERE presence = 'present' AND size_bytes IN (SELECT value FROM json_each(?))").all(sizes) as unknown as MarkedFile[]
  const found = new Map<string, MarkedFile>()
  for (const file of candidates) {
    if (found.size === byHash.size) break
    const hash = await hashOf(db, file)
    if (hash && byHash.has(hash) && !found.has(hash)) found.set(hash, file)
  }
  // una eliminación importada se verifica antes de borrar igual que una marcada aquí (M-1): tamaño y huella de este equipo
  const fingerprints = new Map<number, string | null>()
  for (const [hash, file] of found) {
    if (byHash.get(hash)!.action === 'deleteOn') fingerprints.set(file.file_id, await partialHash(file.path).catch(() => null))
  }
  if (found.size === 0) return { matched: 0, unmatched: data.files.length }
  transaction(db, () => {
    const batchId = createBatch(db, `Importar ${found.size} marcas`)
    for (const [hash, file] of found) {
      const entry = byHash.get(hash)!
      recordItem(db, batchId, file.file_id, { before: decisionOf(db, file.file_id) })
      const isDeletion = entry.action === 'deleteOn'
      writeDecision(db, file.file_id, {
        ...emptyDecision('manual'),
        action: entry.action,
        due_date: entry.dueDate,
        expires_on: entry.expiresOn,
        note: entry.note,
        batch_id: batchId,
        content_hash_at_decision: fingerprints.get(file.file_id) ?? null,
        size_at_decision: isDeletion ? file.size_bytes : null
      })
      if (entry.tags.length) addTags(db, [file.file_id], entry.tags)
      matched++
    }
  })
  return { matched, unmatched: data.files.length - matched }
}
