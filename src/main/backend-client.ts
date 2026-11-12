import { utilityProcess, type UtilityProcess } from 'electron'
import { join } from 'node:path'
import { AppEventSchema, type AppEvent, type BackendEvent, type BackendRequest, type BackendResponse, type Channel, type RpcResult } from '@shared/ipc-contracts'

/** Tope de una petición: un recorrido largo corre en segundo plano; esto cubre una consulta lenta al índice. */
const REQUEST_TIMEOUT_MS = 180_000
const RESTART_DELAY_MS = 500
/** Si vuelve a caer enseguida, cada reinicio espera el doble, hasta este tope: una caída repetida no quema la CPU. */
const MAX_RESTART_DELAY_MS = 60_000
/** Un backend que aguantó esto arriba se considera sano: la espera vuelve a la inicial. */
const STABLE_UPTIME_MS = 60_000

/** Cliente hacia el backend utilityProcess: correlaciona peticiones por id, reenvía eventos y lo reinicia si cae. */
export class BackendClient {
  private child: UtilityProcess | null = null
  private nextId = 1
  private pending = new Map<number, (result: RpcResult) => void>()
  private restartDelay = RESTART_DELAY_MS

  constructor(
    private readonly onEvent: (event: AppEvent) => void,
    private readonly onCrash: (code: number) => void
  ) {}

  start(): void {
    const startedAt = Date.now()
    const child = utilityProcess.fork(join(__dirname, 'backend.js'), [], { serviceName: 'purga-backend', stdio: 'inherit' })
    child.on('message', (message: BackendResponse | BackendEvent) => {
      if (message && 'event' in message) {
        const parsed = AppEventSchema.safeParse(message.event)
        if (parsed.success) this.onEvent(parsed.data)
        return
      }
      const resolve = this.pending.get(message?.id)
      if (!resolve) return
      this.pending.delete(message.id)
      resolve(message.result)
    })
    child.on('exit', (code) => {
      this.onCrash(code)
      for (const resolve of this.pending.values()) {
        resolve({ ok: false, error: { message: `El backend terminó (código ${code}); se reinicia.` } })
      }
      this.pending.clear()
      this.child = null
      const ranLongEnough = Date.now() - startedAt >= STABLE_UPTIME_MS
      this.restartDelay = ranLongEnough ? RESTART_DELAY_MS : Math.min(this.restartDelay * 2, MAX_RESTART_DELAY_MS)
      setTimeout(() => this.start(), this.restartDelay)
    })
    this.child = child
  }

  call(channel: Channel, payload: unknown): Promise<RpcResult> {
    return new Promise((resolve) => {
      if (!this.child) {
        resolve({ ok: false, error: { message: 'El backend no está disponible.' } })
        return
      }
      const id = this.nextId++
      const timer = setTimeout(() => {
        this.pending.delete(id)
        resolve({ ok: false, error: { message: 'El backend no respondió a tiempo.' } })
      }, REQUEST_TIMEOUT_MS)
      this.pending.set(id, (result) => {
        clearTimeout(timer)
        resolve(result)
      })
      const request: BackendRequest = { id, channel, payload }
      this.child.postMessage(request)
    })
  }

  stop(): void {
    this.child?.removeAllListeners('exit')
    this.child?.kill()
    this.child = null
  }
}
