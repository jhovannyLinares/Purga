import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { purgaHome } from './paths'

/**
 * Registro en `%APPDATA%\Purga\logs\purga.log`, una línea JSON por evento. Lleva la operación, el archivo o
 * carpeta afectados y el mensaje original; Purga no maneja contraseñas ni tokens.
 */
type Level = 'ERROR' | 'WARN' | 'INFO'

/** Al pasar este tamaño el registro se aparta como `purga.log.1` (se pisa el anterior) y empieza de nuevo. */
const MAX_LOG_BYTES = 5 * 1024 * 1024
/** La carpeta del usuario lleva su nombre de Windows: en el registro se abrevia, el resto de la ruta sirve para reproducir. */
const USER_FOLDER = homedir()
const USER_FOLDER_PATTERN = new RegExp(USER_FOLDER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')

export const logFile = () => join(purgaHome(), 'logs', 'purga.log')

function withoutUserFolder(text: string | undefined): string | undefined {
  return text?.replace(USER_FOLDER_PATTERN, '~')
}

function rotateIfFull(file: string): void {
  try {
    if (statSync(file).size < MAX_LOG_BYTES) return
  } catch {
    return // todavía no existe: no hay nada que rotar
  }
  renameSync(file, `${file}.1`)
}

function write(level: Level, operation: string, message: string, subject?: string): void {
  const file = logFile()
  mkdirSync(join(file, '..'), { recursive: true })
  rotateIfFull(file)
  const entry = { at: new Date().toISOString(), level, operation, subject: withoutUserFolder(subject), message: withoutUserFolder(message) }
  appendFileSync(file, JSON.stringify(entry) + '\n', 'utf8')
}

export function logError(operation: string, error: unknown, subject?: string): void {
  write('ERROR', operation, error instanceof Error ? error.message : String(error), subject)
}

export function logWarn(operation: string, message: string, subject?: string): void {
  write('WARN', operation, message, subject)
}

export function logInfo(operation: string, message: string, subject?: string): void {
  write('INFO', operation, message, subject)
}
