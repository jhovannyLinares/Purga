import type { FileRow } from '@shared/model'

/** Lo que toda vista de la columna central recibe: qué archivo muestra el detalle y cómo elegir otro. */
export interface ViewProps {
  detailId: number | null
  onDetail: (file: FileRow) => void
}
