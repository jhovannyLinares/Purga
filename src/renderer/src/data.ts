import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { Channel, Req, Res } from '@shared/ipc-contracts'
import { call, errorText } from './api'

/**
 * Datos del backend que se vuelven a pedir solos cuando el índice cambia: `IndexVersion` sube con cada evento
 * `index:changed` y toda vista que usa `useBackend` se refresca.
 */
export const IndexVersion = createContext(0)

export interface Loaded<T> {
  data: T | null
  error: string | null
  reload: () => void
}

export function useBackend<C extends Channel>(channel: C, payload?: Req<C>, extraDeps: unknown[] = []): Loaded<Res<C>> {
  const version = useContext(IndexVersion)
  const [data, setData] = useState<Res<C> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const payloadKey = JSON.stringify(payload ?? null)
  useEffect(() => {
    let current = true
    const args = (payload === undefined ? [] : [payload]) as Req<C> extends void ? [] : [Req<C>]
    call(channel, ...args).then(
      (result) => {
        if (!current) return
        setData(result)
        setError(null)
      },
      (failure: unknown) => current && setError(errorText(failure))
    )
    return () => {
      current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- el payload se compara por su JSON
  }, [channel, payloadKey, version, nonce, ...extraDeps])
  const reload = useCallback(() => setNonce((value) => value + 1), [])
  return { data, error, reload }
}
