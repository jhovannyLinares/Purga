import { isCustomSource } from '@shared/custom-rules'
import type { Proposal, RuleId } from '@shared/rules'
import type { TextKey } from '@shared/i18n'
import { useActions } from '../actions'
import { call } from '../api'
import { useBackend } from '../data'
import { useContext } from 'react'
import { ColumnTable } from '../ColumnTable'
import { fileColumns } from '../fileColumns'
import { LanguageContext, useText } from '../text'
import { Empty, ListHead, MoreMenu } from '../ui'
import type { ViewProps } from './view-props'

export const SOURCE_LABEL: Record<RuleId | 'F-10' | 'F-19', TextKey> = {
  'BD-1': 'rule.bd1',
  'BD-2': 'rule.bd2',
  'BD-3': 'rule.bd3',
  'BD-4': 'rule.bd4',
  'BD-5': 'rule.bd5',
  'BD-6': 'rule.bd6',
  'BD-7': 'rule.bd7',
  'F-10': 'rule.f10',
  'F-19': 'rule.f19'
}

/** El nombre de la regla que propone: el de fábrica traducido, o el que la persona le puso a la suya. */
function sourceLabel(t: ReturnType<typeof useText>, proposal: Proposal): string {
  if (isCustomSource(proposal.source)) return proposal.detail ?? proposal.source
  return t(SOURCE_LABEL[proposal.source as keyof typeof SOURCE_LABEL])
}

/** «Mover por fecha» o «A la Papelera», y el ⋮ de la fila. */
const ACTIONS_COLUMN_PX = 150

interface ProposalRow {
  file: Proposal['file']
  proposals: Proposal[]
  /** solo la propone F-10 (foto sin fecha confiable): aceptar la mueve por fecha, no la borra */
  photoOnly: boolean
}

/** Un archivo que proponen varias reglas va en una sola fila, con las reglas juntas. */
function groupByFile(proposals: Proposal[]): ProposalRow[] {
  const byFile = new Map<number, ProposalRow>()
  for (const proposal of proposals) {
    const row = byFile.get(proposal.file.fileId) ?? { file: proposal.file, proposals: [], photoOnly: true }
    row.proposals.push(proposal)
    row.photoOnly = row.photoOnly && proposal.source === 'F-10'
    byFile.set(proposal.file.fileId, row)
  }
  return [...byFile.values()]
}

/**
 * Propuestas (F-7): ninguna se aplica sola. «A la Papelera» pide confirmación; el resto va en ⋮. «Dejarlo» se
 * recuerda hasta que el archivo cambie; «Conservar siempre» lo marca Conservar y ninguna regla lo vuelve a tocar.
 */
export function ProposalsView({ detailId, onDetail, logo }: ViewProps & { logo: string }) {
  const t = useText()
  const language = useContext(LanguageContext)
  const actions = useActions()
  const { data } = useBackend('proposals:list')
  const proposals = data ?? []
  if (data && proposals.length === 0) return <Empty logo={logo} title={t('proposals.emptyTitle')} text={t('proposals.emptyText')} />
  const reject = (items: Proposal[]) => actions.run(async () => {
    await call('proposals:reject', { fileIds: items.map((item) => item.file.fileId) })
    return { text: t('toast.rejected', { count: items.length }) }
  })
  // F-10: la fecha de la foto salió de la modificación; aceptar la mueve igual a su carpeta por fecha
  const movePhoto = (proposal: Proposal) => actions.run(async () => {
    const result = await call('photos:organize', { fileIds: [proposal.file.fileId], destination: proposal.detail ?? '', granularity: 'day', mode: 'move' })
    return { text: t('toast.photosMoved', { count: result.done }), undoBatchId: result.batchId }
  })
  const rows = groupByFile(proposals)
  const unique = rows.filter((row) => !row.photoOnly).map((row) => row.file)
  return (
    <>
      <ListHead title={t('nav.proposals')} sub={t('proposals.sub')}>
        <button className="btn small" type="button" disabled={unique.length === 0} onClick={() => actions.trash(unique)}>{t('proposals.acceptAll')}</button>
      </ListHead>
      <div className="notice">{t('proposals.notice')}</div>
      <ColumnTable
        tableId="proposals"
        title={t('nav.proposals')}
        rows={rows}
        rowKey={(row) => row.file.fileId}
        rowData={(row) => row.file.fileId}
        catalog={{
          ...fileColumns<ProposalRow>(t, language, (row) => row.file),
          rule: { label: t('table.rule'), render: (row) => { const rules = row.proposals.map((proposal) => sourceLabel(t, proposal)).join(' · '); return <span className="ellipsis" title={rules}>{rules}</span> } }
        }}
        tail={{
          width: ACTIONS_COLUMN_PX,
          cell: (row) => (
            <>
              {row.photoOnly ? (
                <button className="btn small primary" type="button" onClick={() => movePhoto(row.proposals[0]!)}>{t('proposals.confirmDate')}</button>
              ) : (
                <button className="btn small danger" type="button" onClick={() => actions.trash([row.file])}>{t('proposals.accept')}</button>
              )}
              <MoreMenu items={[
                { label: t('selection.preview'), action: () => actions.review([row.file]) },
                null,
                { label: t('proposals.reject'), hint: t('proposals.rejectHint'), action: () => reject(row.proposals) },
                { label: t('proposals.keepAlways'), hint: t('proposals.keepAlwaysHint'), action: () => actions.mark([row.file], 'keep') },
                { label: t('selection.deleteOn'), action: () => actions.mark([row.file], 'deleteOn') },
                { label: t('selection.reviewOn'), action: () => actions.mark([row.file], 'review') }
              ]} />
            </>
          )
        }}
        rowClass={(row) => `cols-proposals ${detailId === row.file.fileId ? 'on' : ''}`}
        onRowClick={(row, event) => !(event.target as HTMLElement).closest('button') && onDetail(row.file)}
      />
    </>
  )
}
