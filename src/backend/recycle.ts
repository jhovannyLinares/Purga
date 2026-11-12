import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { TrashFailure } from '@shared/model'
import { POWERSHELL_EXE } from '@shared/powershell'
import bundledScript from '../../resources/recycle.ps1?asset'

/** Empaquetado, el script vive fuera del asar (asarUnpack): PowerShell no puede leer dentro de él. */
const recycleScript = bundledScript.replace(/app\.asar([\\/])/, 'app.asar.unpacked$1')

/** Enviar a la Papelera de Windows y sacar de ella (F-6, M-6), con `resources/recycle.ps1`. Un proceso por lote. */
export interface RecycleResult {
  path: string
  ok: boolean
  error: TrashFailure | null
  /** La Papelera no creció: estaba desactivada o llena y el shell lo borró en definitiva. */
  permanent?: boolean
  /** El motivo original, para el registro. */
  detail?: string
}

const run = promisify(execFile)
/** Un lote grande en un disco lento tarda; más que esto es que PowerShell se colgó. */
const RECYCLE_TIMEOUT_MS = 300_000

async function recycle(mode: 'trash' | 'restore', paths: string[]): Promise<RecycleResult[]> {
  if (paths.length === 0) return []
  const folder = mkdtempSync(join(tmpdir(), 'purga-recycle-'))
  const listFile = join(folder, 'lista.json')
  try {
    writeFileSync(listFile, JSON.stringify(paths), 'utf8')
    const { stdout } = await run(POWERSHELL_EXE, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', recycleScript, mode, listFile], {
      windowsHide: true,
      timeout: RECYCLE_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024
    })
    return JSON.parse(stdout.trim()) as RecycleResult[]
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
}

export const sendToRecycleBin = (paths: string[]) => recycle('trash', paths)
export const restoreFromRecycleBin = (paths: string[]) => recycle('restore', paths)
