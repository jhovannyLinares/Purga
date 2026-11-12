import { useState } from 'react'
import { EMPTY_FILTERS, type SavedSearch, type SearchFilters } from '@shared/filters'
import { MARK_ACTIONS, ORIGINS, type MarkAction, type Origin, type Root } from '@shared/model'
import { useActions } from '../actions'
import { call } from '../api'
import { useBackend } from '../data'
import { Dialog } from '../Dialog'
import { FileTable } from '../FileTable'
import { MARK_LABEL, ORIGIN_LABEL } from '../format'
import { useText } from '../text'
import { Empty, ListHead } from '../ui'
import type { ViewProps } from './view-props'

/** Días y tamaños que ofrecen los filtros (F-17). */
const DAY_OPTIONS = [30, 60, 90, 180, 365]
const MB = 1024 * 1024
const SIZE_OPTIONS = [1, 10, 100, 1024]

/** Búsqueda combinada (F-17): filtros que se suman, acciones en lote y guardar con nombre. */
export function SearchView({ filters, onFilters, saved, roots, detailId, onDetail }: ViewProps & { filters: SearchFilters; onFilters: (filters: SearchFilters) => void; saved: SavedSearch | null; roots: Root[] }) {
  const t = useText()
  const actions = useActions()
  const { data: results } = useBackend('files:search', filters)
  const { data: tags } = useBackend('tags:list')
  const [saving, setSaving] = useState(false)
  const set = (patch: Partial<SearchFilters>) => onFilters({ ...filters, ...patch })
  const single = <T extends string>(values: T[]) => values[0] ?? ''

  const remove = () => saved && actions.run(async () => {
    await call('searches:delete', { searchId: saved.searchId })
    return { text: t('toast.searchDeleted') }
  })
  return (
    <>
      <ListHead title={saved?.name ?? t('search.title')} sub={t('search.count', { count: results?.length ?? 0 })}>
        {saved && <button className="btn small" type="button" onClick={remove}>{t('search.delete')}</button>}
        <button className="btn small" type="button" onClick={() => setSaving(true)}>{t('search.save')}</button>
      </ListHead>
      <div className="block filters">
        <label className="field text-field"><span className="label">{t('search.text')}</span><input value={filters.text} placeholder={t('search.textHint')} onChange={(event) => set({ text: event.target.value })} /></label>
        <label className="field"><span className="label">{t('table.origin')}</span>
          <select value={single(filters.origins)} onChange={(event) => set({ origins: event.target.value ? [event.target.value as Origin] : [] })}>
            <option value="">{t('search.any')}</option>
            {ORIGINS.map((origin) => <option key={origin} value={origin}>{t(ORIGIN_LABEL[origin])}</option>)}
          </select>
        </label>
        <label className="field"><span className="label">{t('search.unopened')}</span>
          <select value={filters.minDaysUnopened ?? ''} onChange={(event) => set({ minDaysUnopened: event.target.value ? Number(event.target.value) : null })}>
            <option value="">—</option>
            {DAY_OPTIONS.map((days) => <option key={days} value={days}>{t('search.days', { days })}</option>)}
          </select>
        </label>
        <label className="field"><span className="label">{t('search.unmodified')}</span>
          <select value={filters.minDaysUnmodified ?? ''} onChange={(event) => set({ minDaysUnmodified: event.target.value ? Number(event.target.value) : null })}>
            <option value="">—</option>
            {DAY_OPTIONS.map((days) => <option key={days} value={days}>{t('search.days', { days })}</option>)}
          </select>
        </label>
        <label className="field"><span className="label">{t('table.mark')}</span>
          <select value={single(filters.actions)} onChange={(event) => set({ actions: event.target.value ? [event.target.value as MarkAction] : [] })}>
            <option value="">{t('search.any')}</option>
            {MARK_ACTIONS.map((action) => <option key={action} value={action}>{t(MARK_LABEL[action])}</option>)}
          </select>
        </label>
        <label className="field"><span className="label">{t('detail.tags')}</span>
          <select value="" onChange={(event) => event.target.value && !filters.tags.includes(event.target.value) && set({ tags: [...filters.tags, event.target.value] })}>
            <option value="">{filters.tags.length ? t('search.addTag') : t('search.any')}</option>
            {(tags ?? []).filter((tag) => !filters.tags.includes(tag.name)).map((tag) => <option key={tag.name} value={tag.name}>#{tag.name}</option>)}
          </select>
        </label>
        {filters.tags.length > 0 && (
          <div className="field"><span className="label">{t('search.tagMode')}</span>
            <div className="row">
              <div className="segmented">
                <button type="button" className={filters.tagMode === 'all' ? 'on' : ''} onClick={() => set({ tagMode: 'all' })}>{t('search.all')}</button>
                <button type="button" className={filters.tagMode === 'any' ? 'on' : ''} onClick={() => set({ tagMode: 'any' })}>{t('search.some')}</button>
              </div>
              <div className="chips">{filters.tags.map((tag) => <button type="button" key={tag} className="chip on" onClick={() => set({ tags: filters.tags.filter((item) => item !== tag) })}>#{tag} ×</button>)}</div>
            </div>
          </div>
        )}
        <label className="field"><span className="label">{t('search.minSize')}</span>
          <select value={filters.minSizeBytes ?? ''} onChange={(event) => set({ minSizeBytes: event.target.value ? Number(event.target.value) : null })}>
            <option value="">—</option>
            {SIZE_OPTIONS.map((size) => <option key={size} value={size * MB}>{size >= 1024 ? `${size / 1024} GB` : `${size} MB`}</option>)}
          </select>
        </label>
        <label className="field"><span className="label">{t('detail.folder')}</span>
          <select value={filters.rootIds[0] ?? ''} onChange={(event) => set({ rootIds: event.target.value ? [Number(event.target.value)] : [] })}>
            <option value="">{t('search.any')}</option>
            {roots.map((root) => <option key={root.rootId} value={root.rootId}>{root.name}</option>)}
          </select>
        </label>
        <label className="field"><span className="label">{t('search.type')}</span>
          <input value={filters.extensions.join(', ')} placeholder="pdf, jpg" style={{ width: 110 }} onChange={(event) => set({ extensions: event.target.value.split(',').map((value) => value.trim()).filter(Boolean) })} />
        </label>
        <button className="btn small" type="button" onClick={() => onFilters(EMPTY_FILTERS)}>{t('search.clear')}</button>
      </div>
      {results && results.length === 0 ? (
        <Empty title={t('search.noneTitle')} text={t('search.noneText')} />
      ) : (
        <FileTable tableId="search" title={t('search.title')} files={results ?? []} detailId={detailId} onDetail={onDetail} />
      )}
      {saving && <SaveSearchDialog filters={filters} onClose={() => setSaving(false)} />}
    </>
  )
}

function SaveSearchDialog({ filters, onClose }: { filters: SearchFilters; onClose: () => void }) {
  const t = useText()
  const actions = useActions()
  const [name, setName] = useState('')
  const save = () => {
    onClose()
    actions.run(async () => {
      await call('searches:save', { name, filters })
      return { text: t('toast.searchSaved', { name }) }
    })
  }
  const footer = (
    <>
      <button className="btn" type="button" onClick={onClose}>{t('common.cancel')}</button>
      <button className="btn primary" type="button" disabled={!name.trim()} onClick={save}>{t('common.save')}</button>
    </>
  )
  return (
    <Dialog title={t('search.save')} footer={footer} onClose={onClose}>
      <label className="field"><span className="label accent">{t('search.name')}</span><input value={name} autoFocus onChange={(event) => setName(event.target.value)} /></label>
      <span className="hint">{t('search.saveHint')}</span>
    </Dialog>
  )
}
