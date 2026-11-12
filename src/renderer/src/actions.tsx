import { createContext, useContext, useState, type ReactNode } from 'react'
import type { FileRow, MarkAction, Root } from '@shared/model'
import { call, errorText } from './api'
import { MarkDialog, ReviewDialog, TagDialog, TrashDialog, type MarkChoice } from './FileDialogs'
import { useText } from './text'
import { UnwatchDialog } from './UnwatchDialog'
import { Toast, type ToastMessage } from './ui'

/**
 * Acciones sobre archivos que comparten todas las vistas: marcar, enviar a la Papelera, vista previa, etiquetar y
 * deshacer. Cada una abre su diálogo cuando hace falta y termina con un aviso (con Deshacer si dejó un lote).
 */
export interface FileActions {
  mark: (files: FileRow[], action: MarkAction) => void
  trash: (files: FileRow[], onDone?: () => void) => void
  review: (files: FileRow[]) => void
  tag: (files: FileRow[]) => void
  undo: (batchId: number | null) => void
  notify: (message: ToastMessage) => void
  /** dejar de vigilar una carpeta, con confirmación: no borra nada del disco */
  unwatch: (root: Root) => void
  run: (work: () => Promise<ToastMessage | null>) => void
}

const ActionsContext = createContext<FileActions | null>(null)

export function useActions(): FileActions {
  const actions = useContext(ActionsContext)
  if (!actions) throw new Error('useActions fuera de ActionsProvider')
  return actions
}

type OpenDialog =
  | { kind: 'mark'; files: FileRow[]; action: 'deleteOn' | 'review' | 'keep' }
  | { kind: 'trash'; files: FileRow[]; onDone?: () => void }
  | { kind: 'review'; files: FileRow[] }
  | { kind: 'tag'; files: FileRow[]; known: string[] }
  | { kind: 'unwatch'; root: Root }

export function ActionsProvider({ children }: { children: ReactNode }) {
  const t = useText()
  const [dialog, setDialog] = useState<OpenDialog | null>(null)
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const close = () => setDialog(null)

  const run = (work: () => Promise<ToastMessage | null>) => {
    work().then(
      (message) => message && setToast(message),
      (error: unknown) => setToast({ text: errorText(error) })
    )
  }

  const applyMark = (files: FileRow[], choice: MarkChoice) =>
    run(async () => {
      const batchId = await call('marks:apply', { fileIds: files.map((file) => file.fileId), action: choice.action, dueDate: choice.dueDate, expiresOn: choice.expiresOn })
      return { text: t('toast.marked', { count: files.length }), undoBatchId: batchId }
    })

  const actions: FileActions = {
    mark: (files, action) => {
      if (files.length === 0) return
      if (action === 'deleteOn' || action === 'review' || action === 'keep') setDialog({ kind: 'mark', files, action })
      else applyMark(files, { action, dueDate: null, expiresOn: null })
    },
    trash: (files, onDone) => files.length > 0 && setDialog({ kind: 'trash', files, onDone }),
    review: (files) => files.length > 0 && setDialog({ kind: 'review', files }),
    tag: (files) =>
      run(async () => {
        const known = (await call('tags:list')).map((tag) => tag.name)
        setDialog({ kind: 'tag', files, known })
        return null
      }),
    undo: (batchId) =>
      run(async () => {
        const result = await call('batches:undo', { batchId })
        return { text: result.failed.length ? t('toast.undoPartial', { count: result.failed.length }) : t('toast.undone') }
      }),
    unwatch: (root) => setDialog({ kind: 'unwatch', root }),
    notify: setToast,
    run
  }

  return (
    <ActionsContext.Provider value={actions}>
      {children}
      {dialog?.kind === 'mark' && (
        <MarkDialog action={dialog.action} count={dialog.files.length} onClose={close} onConfirm={(choice) => {
          close()
          applyMark(dialog.files, choice)
        }} />
      )}
      {dialog?.kind === 'trash' && (
        <TrashDialog files={dialog.files} onClose={close} onConfirm={(fileIds, confirmedPermanent) => {
          close()
          run(async () => {
            const result = await call('marks:trash', { fileIds, confirmedPermanent })
            dialog.onDone?.()
            const parts: string[] = []
            if (result.trashed) parts.push(t('toast.trashed', { count: result.trashed }))
            // también lo que la Papelera no recibió (desactivada o llena): el usuario tiene que saber que no vuelve
            if (result.deleted) parts.push(t('toast.deleted', { count: result.deleted }))
            if (result.failed.length) parts.push(t('toast.failed', { count: result.failed.length, reason: t(`trashFail.${result.failed[0]!.reason}`) }))
            return { text: parts.join(' '), undoBatchId: result.trashed ? result.batchId : null }
          })
        }} />
      )}
      {dialog?.kind === 'review' && <ReviewDialog files={dialog.files} onClose={close} />}
      {dialog?.kind === 'tag' && (
        <TagDialog count={dialog.files.length} known={dialog.known} onClose={close} onConfirm={(names) => {
          close()
          run(async () => {
            await call('tags:add', { fileIds: dialog.files.map((file) => file.fileId), names })
            return { text: t('toast.tagged', { count: dialog.files.length }) }
          })
        }} />
      )}
      {dialog?.kind === 'unwatch' && (
        <UnwatchDialog root={dialog.root} onClose={close} onConfirm={() => {
          close()
          run(async () => {
            await call('roots:remove', { rootId: dialog.root.rootId })
            return { text: t('toast.rootRemoved', { name: dialog.root.name }) }
          })
        }} />
      )}
      {toast && <Toast message={toast} onDone={() => setToast(null)} onUndo={(batchId) => {
        setToast(null)
        actions.undo(batchId)
      }} />}
    </ActionsContext.Provider>
  )
}
