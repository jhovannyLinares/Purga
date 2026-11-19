import type { AboutInfo } from '@shared/ipc-contracts'
import type { Preview } from '@shared/preview'

/** Lo que el preload expone en `window.purga` (src/preload/index.ts). */
declare global {
  interface Window {
    purga: {
      invoke: (channel: string, payload: unknown) => Promise<unknown>
      onEvent: (callback: (event: unknown) => void) => () => void
      onExplorerRequest: (callback: (paths: unknown) => void) => () => void
      about: () => Promise<AboutInfo>
      ready: () => Promise<void>
      quit: () => Promise<void>
      hide: () => Promise<void>
      pickFolder: () => Promise<string | null>
      pickSaveJson: (defaultName: string) => Promise<string | null>
      pickOpenJson: () => Promise<string | null>
      openPath: (path: string) => Promise<boolean>
      revealFile: (fileId: number) => Promise<boolean>
      openFileWith: (fileId: number) => Promise<boolean>
      preview: (fileId: number) => Promise<Preview>
      openFolder: (folder: string) => Promise<boolean>
    }
  }
}

export {}
