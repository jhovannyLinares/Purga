import type { AppEvent } from '@shared/ipc-contracts'

/** Salida de eventos del backend hacia la interfaz; la conecta index.ts al puerto del utilityProcess. */
let emitter: (event: AppEvent) => void = () => {}

export function setEmitter(next: (event: AppEvent) => void): void {
  emitter = next
}

export function emit(event: AppEvent): void {
  emitter(event)
}
