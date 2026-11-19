/**
 * Backend en Electron utilityProcess: el índice, el disco y la Papelera viven aquí, nunca en la interfaz.
 * Recibe peticiones de main y responde con el mismo id; los eventos salen por el mismo puerto.
 */
import type { BackendEvent, BackendRequest, BackendResponse } from '@shared/ipc-contracts'
import { setEmitter } from './events'
import { dispatch } from './handlers'
import { start } from './service'

const port = process.parentPort
if (!port) {
  console.error('El backend debe correr como utilityProcess.')
  process.exit(1)
}

setEmitter((event) => {
  const message: BackendEvent = { event }
  port.postMessage(message)
})

port.on('message', async (message: { data: BackendRequest }) => {
  const { id, channel, payload } = message.data ?? ({} as BackendRequest)
  if (typeof id !== 'number') return
  const response: BackendResponse = { id, result: await dispatch(channel, payload) }
  port.postMessage(response)
})

start()
