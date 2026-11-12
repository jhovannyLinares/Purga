import type { ReactNode } from 'react'
import { activityPercent, activityTone, type ActivityTone, type SortKey } from '@shared/file-order'
import type { Language, TextKey } from '@shared/i18n'
import type { FileRow } from '@shared/model'
import type { ColumnId } from '@shared/table-columns'
import { activityParts, daysBetween, daysSince, formatBytes, formatDay, ORIGIN_LABEL, shortEvidence, todayDay } from './format'
import type { Translate } from './text'
import { FileActions, FileNameLine, MarkBadge, markTitle, TagChips } from './ui'

/** Una columna de una tabla: su título, si es numérica, por qué orden se ordena (si se ordena) y qué pinta cada fila. */
export interface Column<Row> {
  label: string
  numeric?: boolean
  sortKey?: SortKey
  render: (row: Row) => ReactNode
}
export type ColumnCatalog<Row> = Partial<Record<ColumnId, Column<Row>>>

const ACTIVITY_LABEL: Record<ActivityTone, TextKey> = { ok: 'activity.ok', warn: 'activity.warn', err: 'activity.err' }

/** Barra bajo los días sin abrir: el color dice en uso, quieto o dormido; el texto de los días se queda al lado. */
function ActivityBar({ days, label }: { days: number; label: string }) {
  return (
    <span className={`activity-bar ${activityTone(days)}`} role="img" aria-label={label} title={label}>
      <i style={{ width: `${activityPercent(days)}%` }} />
    </span>
  )
}

/** Nombre legible del tipo de archivo por su extensión; lo que no está aquí se nombra por la extensión. */
const KIND_LABEL: Record<string, TextKey> = {
  pdf: 'kind.pdf', doc: 'kind.word', docx: 'kind.word', xls: 'kind.excel', xlsx: 'kind.excel', csv: 'kind.csv', ppt: 'kind.powerpoint', pptx: 'kind.powerpoint',
  txt: 'kind.text', md: 'kind.text', jpg: 'kind.jpeg', jpeg: 'kind.jpeg', png: 'kind.png', gif: 'kind.image', webp: 'kind.image', heic: 'kind.image', bmp: 'kind.image',
  mp4: 'kind.video', mov: 'kind.video', mkv: 'kind.video', avi: 'kind.video', mp3: 'kind.audio', wav: 'kind.audio', m4a: 'kind.audio',
  zip: 'kind.archive', rar: 'kind.archive', '7z': 'kind.archive', exe: 'kind.program', msi: 'kind.installer'
}
export function kindText(t: Translate, file: FileRow): string {
  const key = KIND_LABEL[file.extension.toLowerCase()]
  if (key) return t(key)
  return file.extension ? t('kind.other', { extension: file.extension }) : t('kind.none')
}

const idleDays = (file: FileRow) => daysSince(file.openedAt ?? file.modifiedAt)

/** Las columnas que comparte toda tabla de archivos. `pick` saca el archivo de la fila (una propuesta lo envuelve). */
export function fileColumns<Row>(t: Translate, language: Language, pick: (row: Row) => FileRow): ColumnCatalog<Row> {
  const today = todayDay()
  const when = (day: string) => {
    const days = daysBetween(today, day)
    if (days <= 0) return t('scheduled.today')
    return days === 1 ? t('scheduled.tomorrow') : t('scheduled.inDays', { days })
  }
  return {
    name: {
      label: t('table.name'),
      sortKey: 'name',
      render: (row) => {
        const file = pick(row)
        const extra = (file.tags.length > 0 || file.note) && (
          <span className="sub ellipsis" title={[...file.tags.map((tag) => `#${tag.name}`), file.note].filter(Boolean).join(' · ')}><TagChips file={file} />{file.note ? ` ✎ ${file.note}` : ''}</span>
        )
        return <span className="name-cell"><FileNameLine file={file} extra={extra} /><FileActions file={file} /></span>
      }
    },
    kind: { label: t('column.kind'), render: (row) => <span className="ellipsis" title={kindText(t, pick(row))}>{kindText(t, pick(row))}</span> },
    ext: { label: t('column.ext'), render: (row) => (pick(row).extension ? `.${pick(row).extension}` : '—') },
    origin: { label: t('table.origin'), sortKey: 'origin', render: (row) => <span className="ellipsis" title={t(ORIGIN_LABEL[pick(row).origin])}>{t(ORIGIN_LABEL[pick(row).origin])}</span> },
    site: {
      label: t('column.site'),
      render: (row) => {
        const evidence = pick(row).originEvidence
        return evidence ? <span className="ellipsis" title={evidence}>{shortEvidence(evidence)}</span> : '—'
      }
    },
    activity: {
      label: t('table.activity'),
      sortKey: 'activity',
      render: (row) => {
        const file = pick(row)
        const parts = activityParts(t, file)
        const tone = activityTone(idleDays(file))
        return <span className="muted activity" title={`${parts.days} · ${parts.source}`}><span className="ellipsis">{parts.days}</span><span className="sub ellipsis">{parts.source}</span><ActivityBar days={idleDays(file)} label={t(ACTIVITY_LABEL[tone])} /></span>
      }
    },
    opened: { label: t('column.opened'), render: (row) => (pick(row).openedAt ? t('detail.daysAgo', { days: daysSince(pick(row).openedAt!) }) : t('column.never')) },
    modified: { label: t('column.modified'), render: (row) => t('detail.daysAgo', { days: daysSince(pick(row).modifiedAt) }) },
    size: { label: t('table.size'), numeric: true, sortKey: 'size', render: (row) => formatBytes(pick(row).sizeBytes, language) },
    mark: { label: t('table.mark'), sortKey: 'mark', render: (row) => <span className="row ellipsis" style={{ gap: 4 }} title={markTitle(t, pick(row))}><MarkBadge file={pick(row)} /></span> },
    tags: { label: t('column.tags'), render: (row) => <span className="row ellipsis" style={{ gap: 4 }}><TagChips file={pick(row)} /></span> },
    note: { label: t('column.note'), render: (row) => <span className="ellipsis" title={pick(row).note ?? ''}>{pick(row).note ?? ''}</span> },
    due: {
      label: t('column.due'),
      render: (row) => {
        const file = pick(row)
        if (!file.dueDate) return <MarkBadge file={file} />
        return <span className={`badge ${file.action === 'deleteOn' ? 'warn' : 'new'}`}>{formatDay(file.dueDate)} · {when(file.dueDate)}</span>
      }
    },
    expires: { label: t('table.expires'), render: (row) => (pick(row).expiresOn ? formatDay(pick(row).expiresOn!) : '—') },
    status: {
      label: t('table.status'),
      render: (row) => {
        const expiresOn = pick(row).expiresOn
        if (!expiresOn) return '—'
        const left = daysBetween(today, expiresOn)
        return <span className={`badge ${expiryTone(left) || 'new'}`}>{left === 0 ? t('scheduled.today') : t('scheduled.inDays', { days: left })}</span>
      }
    }
  }
}

/** Los vencimientos de la próxima semana resaltan la fila y su insignia. */
const EXPIRY_WARNING_DAYS = 7
export const expiryTone = (daysLeft: number) => (daysLeft <= EXPIRY_WARNING_DAYS ? 'warn' : '')
