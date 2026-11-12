import { readFileSync } from 'node:fs'
import type { Origin } from '@shared/model'

/**
 * Origen de un archivo (F-2), por evidencia y en este orden; sin evidencia, «Desconocido», nunca una adivinanza.
 * Sube `INFERENCE_VERSION` si cambian las reglas: así se sabe qué filas recalcular.
 */
export const INFERENCE_VERSION = 1

export interface ProvenanceGuess {
  origin: Origin
  confidence: number
  evidence: string | null
}

const UNKNOWN: ProvenanceGuess = { origin: 'unknown', confidence: 0, evidence: null }

/** Lee el stream alterno que Windows pone a lo descargado; null si no hay (no es error: casi ningún archivo lo tiene). */
export function readZoneIdentifier(path: string): string | null {
  try {
    return readFileSync(`${path}:Zone.Identifier`, 'utf8')
  } catch {
    return null
  }
}

interface PathRule {
  origin: Origin
  confidence: number
  test: (lowerPath: string, lowerName: string) => boolean
  evidence: string
}

const PATH_RULES: PathRule[] = [
  { origin: 'outlook', confidence: 0.9, test: (path) => path.includes('\\content.outlook\\') || path.includes('\\outlook\\attachments\\'), evidence: 'carpeta de adjuntos de Outlook' },
  { origin: 'whatsapp', confidence: 0.85, test: (path, name) => /^whatsapp (image|video|audio)/.test(name) || path.includes('\\whatsapp\\'), evidence: 'nombre o carpeta de WhatsApp' },
  { origin: 'telegram', confidence: 0.9, test: (path) => path.includes('\\downloads\\telegram desktop\\'), evidence: 'Downloads\\Telegram Desktop' },
  { origin: 'screenshot', confidence: 0.8, test: (path, name) => path.includes('\\screenshots\\') || /^(captura de pantalla|screenshot)/.test(name), evidence: 'captura de pantalla' }
]

export function inferProvenance(path: string, zoneIdentifier: string | null): ProvenanceGuess {
  const hostUrl = zoneIdentifier?.match(/^HostUrl=(.+)$/m)?.[1]?.trim()
  if (hostUrl) return { origin: 'browser', confidence: 0.95, evidence: hostUrl }
  const lowerPath = path.toLowerCase()
  const lowerName = lowerPath.slice(lowerPath.lastIndexOf('\\') + 1)
  const rule = PATH_RULES.find((candidate) => candidate.test(lowerPath, lowerName))
  if (rule) return { origin: rule.origin, confidence: rule.confidence, evidence: rule.evidence }
  if (lowerPath.includes('\\downloads\\') || lowerPath.includes('\\descargas\\')) {
    return { origin: 'downloads', confidence: 0.5, evidence: 'carpeta Descargas, sin marca del navegador' }
  }
  return UNKNOWN
}
