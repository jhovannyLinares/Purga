import type { Language } from './i18n'

/**
 * Textos de la Ayuda (F1), en los dos idiomas. Describen el proceso, no el estado: nada de conteos ni fechas que
 * caducan. Cada sección es una lista de { título, texto }.
 */
export interface HelpSection {
  title: string
  text: string
}

const GUIDE: Record<Language, HelpSection[]> = {
  es: [
    { title: '1. Elige qué vigilar', text: 'Archivo › Agregar carpeta. Purga la revisa por detrás y la mantiene al día mientras está abierta; puedes usarla mientras tanto.' },
    { title: '2. Marca lo que se queda y lo que se va', text: 'En Explorar, marca varios archivos con las casillas: Conservar, Eliminar, Eliminar el…, Revisar el… o Archivado. Cada acción es un lote con Deshacer.' },
    { title: '3. Revisa las propuestas', text: 'Las reglas proponen; nada se borra sin tu decisión, y lo borrado va a la Papelera de reciclaje. Rechazar una propuesta evita que vuelva hasta que el archivo cambie.' },
    { title: '4. Protege lo que vence', text: 'Conservar con fecha de vencimiento te avisa 60, 30, 7 y 1 días antes.' },
    { title: '5. Mira antes de borrar', text: 'Vista previa (tecla Espacio con archivos elegidos) muestra cada archivo sin abrir su programa; en la confirmación puedes sacar cualquiera del lote.' },
    { title: '6. Desde el Explorador', text: 'Clic derecho sobre uno o varios archivos › Mostrar más opciones › Programar eliminación con Purga…' }
  ],
  en: [
    { title: '1. Choose what to watch', text: 'File › Add folder. Purga checks it in the background and keeps it up to date while it runs; you can keep using it meanwhile.' },
    { title: '2. Mark what stays and what goes', text: 'In Explore, tick several files: Keep, Delete, Delete on…, Review on… or Archived. Each action is a batch you can undo.' },
    { title: '3. Review the proposals', text: 'Rules only propose; nothing is deleted without your decision, and deleted files go to the Recycle Bin. Rejecting a proposal keeps it away until the file changes.' },
    { title: '4. Protect what expires', text: 'Keep with an expiry date warns you 60, 30, 7 and 1 days before.' },
    { title: '5. Look before deleting', text: 'Preview (Space with files selected) shows each file without opening its program; in the confirmation you can take any of them out of the batch.' },
    { title: '6. From File Explorer', text: 'Right-click one or more files › Show more options › Schedule deletion with Purga…' }
  ]
}

const GOOD_TO_KNOW: Record<Language, HelpSection[]> = {
  es: [
    { title: 'Última apertura', text: 'Windows casi nunca registra cuándo abriste un archivo; Purga lo toma de los «Recientes» de Windows y, si no hay, cuenta desde la última modificación.' },
    { title: 'Fecha de creación', text: 'Copiar un archivo le pone fecha de creación nueva: por eso la creación no cuenta.' },
    { title: 'Archivos que cambian', text: 'Si un archivo marcado para eliminar cambia, la marca se suspende y pasa a Revisar.' },
    { title: 'Discos sin Papelera', text: 'En USB, red y discos externos borrar es definitivo: Purga pide escribir cuántos archivos son y no ejecuta sola las eliminaciones programadas allí.' },
    { title: 'Archivos movidos', text: 'La marca sigue al archivo si lo renombras o lo mueves dentro del mismo disco.' },
    { title: 'OneDrive', text: 'Los archivos que solo están en la nube se indexan por sus datos; Purga no los descarga para buscar duplicados.' }
  ],
  en: [
    { title: 'Last opened', text: 'Windows rarely records when you opened a file; Purga reads it from Windows «Recent» items and, if there is none, counts from the last modification.' },
    { title: 'Creation date', text: 'Copying a file gives it a new creation date: that is why creation does not count.' },
    { title: 'Files that change', text: 'If a file marked for deletion changes, the mark is suspended and moves to Review.' },
    { title: 'Drives without Recycle Bin', text: 'On USB, network and external drives deleting is permanent: Purga asks you to type how many files and never runs scheduled deletions there on its own.' },
    { title: 'Moved files', text: 'The mark follows the file if you rename it or move it on the same drive.' },
    { title: 'OneDrive', text: 'Cloud-only files are indexed by their details; Purga does not download them to look for duplicates.' }
  ]
}

const RELEASE_NOTES: Record<Language, HelpSection[]> = {
  es: [{ title: '0.1.0', text: 'Primera versión: carpetas vigiladas, origen y actividad, marcas con lotes y Deshacer, eliminación programada, propuestas de limpieza, duplicados, fotos parecidas y por fecha, vencimientos, etiquetas, búsqueda combinada, vista previa y clic derecho del Explorador.' }],
  en: [{ title: '0.1.0', text: 'First release: watched folders, origin and activity, marks with batches and Undo, scheduled deletion, cleanup proposals, duplicates, similar photos and photos by date, expiries, tags, combined search, preview and the File Explorer right-click.' }]
}

export const HELP = { guide: GUIDE, goodToKnow: GOOD_TO_KNOW, releaseNotes: RELEASE_NOTES }
export type HelpTopic = keyof typeof HELP | 'log'
