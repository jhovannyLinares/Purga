import type { AppEvent, Channel, Req, Res } from '@shared/ipc-contracts'

/** Llama al backend por un canal tipado; si responde error, lanza Error con el mensaje para mostrar. */
export async function call<C extends Channel>(channel: C, ...payload: Req<C> extends void ? [] : [Req<C>]): Promise<Res<C>> {
  const result = (await window.purga.invoke(channel, payload[0])) as { ok: true; data: Res<C> } | { ok: false; error: { message: string } }
  if (!result.ok) throw new Error(result.error.message)
  return result.data
}

export function onAppEvent(callback: (event: AppEvent) => void): () => void {
  return window.purga.onEvent((event) => callback(event as AppEvent))
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
