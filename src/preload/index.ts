import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

/** Única superficie expuesta a la interfaz: canales tipados, eventos y las acciones de la ventana. Sin Node. */
function subscribe(channel: string, callback: (payload: unknown) => void): () => void {
  const listener = (_event: IpcRendererEvent, payload: unknown) => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api = {
  invoke: (channel: string, payload: unknown) => ipcRenderer.invoke('rpc', { channel, payload }),
  onEvent: (callback: (event: unknown) => void) => subscribe('app-event', callback),
  /** archivos que llegan del clic derecho del Explorador (F-13) */
  onExplorerRequest: (callback: (paths: unknown) => void) => subscribe('explorer-request', callback),
  about: () => ipcRenderer.invoke('app:about'),
  /** avisa que la interfaz cargó, para cerrar la pantalla de carga */
  ready: () => ipcRenderer.invoke('app:ready'),
  quit: () => ipcRenderer.invoke('app:quit'),
  hide: () => ipcRenderer.invoke('app:hide'),
  pickFolder: () => ipcRenderer.invoke('dialog:folder'),
  pickSaveJson: (defaultName: string) => ipcRenderer.invoke('dialog:saveJson', defaultName),
  pickOpenJson: () => ipcRenderer.invoke('dialog:openJson'),
  openPath: (path: string) => ipcRenderer.invoke('shell:open', path),
  revealFile: (fileId: number) => ipcRenderer.invoke('file:reveal', fileId),
  openFileWith: (fileId: number) => ipcRenderer.invoke('file:openWith', fileId),
  preview: (fileId: number) => ipcRenderer.invoke('file:preview', fileId),
  openFolder: (folder: string) => ipcRenderer.invoke('folder:open', folder)
}

contextBridge.exposeInMainWorld('purga', api)
