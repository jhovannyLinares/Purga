import { useContext, useEffect, useState } from 'react'
import { EXTENSION_GROUPS, normalizeExtension } from '@shared/extensions'
import type { ExtensionFilter, Root } from '@shared/model'
import type { Preferences } from '@shared/preferences'
import { useActions } from './actions'
import { call } from './api'
import { useBackend } from './data'
import { Dialog } from './Dialog'
import { formatBytes, formatCount } from './format'
import { LanguageContext, useText, type Translate } from './text'
import { ColumnTable } from './ColumnTable'
import type { ColumnCatalog } from './fileColumns'
import { folderMarkText } from './views/ExploreView'
import type { Language } from '@shared/i18n'

/** Los nombres de los idiomas no se traducen: cada uno se escribe en su propia lengua. */
const LANGUAGE_NAMES = { es: 'Español', en: 'English' }
/** «Editar» y «Dejar de vigilar», con el ⋮ del encabezado encima. */
const FOLDER_ACTIONS_PX = 190

/** Columnas de la tabla de carpetas vigiladas (lámina 14): la ruta siempre; el resto, a elección. */
function folderColumns(t: Translate, language: Language): ColumnCatalog<Root> {
  const extensionsText = (root: Root) => root.extensions ? t(root.extensions.mode === 'deny' ? 'settings.ownDeny' : 'settings.ownAllow', { count: root.extensions.extensions.length }) : t('settings.inherits')
  return {
    path: { label: t('detail.folder'), render: (root) => <span className="ellipsis" title={root.path}>{root.path}</span> },
    files: { label: t('settings.files'), render: (root) => `${formatCount(root.files, language)} · ${formatBytes(root.bytes, language)}` },
    extensions: { label: t('settings.extensions'), render: (root) => <span className="ellipsis" title={extensionsText(root)}>{extensionsText(root)}</span> },
    folderMark: { label: t('column.folderMark'), render: (root) => <span className="ellipsis" title={folderMarkText(t, root.folderMark)}>{folderMarkText(t, root.folderMark)}</span> },
    folderTags: { label: t('column.tags'), render: (root) => <span className="row ellipsis" style={{ gap: 4 }}>{root.tags.map((tag) => <span className="badge" key={tag}>#{tag}</span>)}</span> }
  }
}

interface SettingsViewProps {
  preferences: Preferences
  dataDir: string
  roots: Root[]
  onChange: (next: Preferences) => void
}

/** Configuración (columna central, como en la maqueta): carpetas, extensiones (F-12), idioma, tema y bandeja. */
export function SettingsView({ preferences, dataDir, roots, onChange }: SettingsViewProps) {
  const t = useText()
  const actions = useActions()
  const language = useContext(LanguageContext)
  const [editingRoot, setEditingRoot] = useState<Root | null>(null)
  const { data: globalFilter } = useBackend('extensions:get')
  const { data: errors } = useBackend('roots:errors')
  const set = (patch: Partial<Preferences>) => onChange({ ...preferences, ...patch })
  const languages: [Preferences['language'], string][] = [['system', t('settings.system')], ['es', LANGUAGE_NAMES.es], ['en', LANGUAGE_NAMES.en]]
  const themes: [Preferences['theme'], string][] = [['system', t('settings.system')], ['light', t('settings.light')], ['dark', t('settings.dark')]]
  return (
    <div className="view-scroll">
      <div className="list-head">
        <span className="list-title">{t('settings.title')}</span>
        <span className="list-sub ellipsis" title={t('settings.sub', { path: dataDir })}>{t('settings.sub', { path: dataDir })}</span>
      </div>
      <div className="block">
        <h4>{t('nav.roots')}</h4>
        <ColumnTable
          tableId="folders"
          title={t('nav.roots')}
          style={{ flex: 'none' }}
          rows={roots}
          rowKey={(root) => root.rootId}
          catalog={folderColumns(t, language)}
          tail={{ width: FOLDER_ACTIONS_PX, cell: (root) => (
            <>
              <button className="btn small" type="button" title={t('settings.editHint')} onClick={() => setEditingRoot(root)}>{t('settings.edit')}</button>
              <button className="btn small danger" type="button" onClick={() => actions.unwatch(root)}>{t('explore.stopWatching')}</button>
            </>
          ) }}
          rowClass={() => 'static cols-folders'}
          empty={<span className="hint">{t('nav.noRoots')}</span>}
        />
        {errors && errors.length > 0 && (
          <div className="warn-box">
            <b>{t('settings.unreadable')}</b>
            {errors.map((error) => <div className="ellipsis" key={error.path} title={error.message}>{error.path}</div>)}
          </div>
        )}
      </div>
      {globalFilter && <ExtensionEditor title={t('settings.globalExtensions')} rootId={null} initial={globalFilter} />}
      <div className="block">
        <h4>{t('settings.general')}</h4>
        <div className="row settings-row">
          <span className="settings-name">{t('settings.language')}</span>
          <Segmented options={languages} value={preferences.language} onPick={(value) => set({ language: value })} />
        </div>
        <div className="row settings-row">
          <span className="settings-name">{t('settings.theme')}</span>
          <Segmented options={themes} value={preferences.theme} onPick={(value) => set({ theme: value })} />
        </div>
        <label className="row settings-row">
          <input type="checkbox" checked={preferences.keepInTray} onChange={(event) => set({ keepInTray: event.target.checked })} />
          <span>{t('settings.keepInTray')}</span>
        </label>
        <label className="row settings-row">
          <input type="checkbox" checked={preferences.startWithWindows} onChange={(event) => set({ startWithWindows: event.target.checked })} />
          <span>{t('settings.startWithWindows')}</span>
        </label>
      </div>
      {editingRoot && <RootExtensionsDialog root={editingRoot} onClose={() => setEditingRoot(null)} />}
    </div>
  )
}

function Segmented<T extends string>({ options, value, onPick }: { options: [T, string][]; value: T; onPick: (value: T) => void }) {
  return (
    <div className="segmented">
      {options.map(([id, label]) => (
        <button type="button" key={id} className={id === value ? 'on' : ''} onClick={() => onPick(id)}>{label}</button>
      ))}
    </div>
  )
}

/** Filtro de extensiones: modo y lista, con grupos de un clic y extensiones propias (F-12). */
function ExtensionEditor({ title, rootId, initial, onSaved }: { title: string; rootId: number | null; initial: ExtensionFilter; onSaved?: () => void }) {
  const t = useText()
  const actions = useActions()
  const [filter, setFilter] = useState(initial)
  const [other, setOther] = useState('')
  useEffect(() => setFilter(initial), [initial])
  const listed = new Set(filter.extensions)
  const toggle = (extension: string) => setFilter({ ...filter, extensions: listed.has(extension) ? filter.extensions.filter((item) => item !== extension) : [...filter.extensions, extension] })
  const custom = filter.extensions.filter((extension) => !Object.values(EXTENSION_GROUPS).flat().includes(extension))
  const add = () => {
    const extension = normalizeExtension(other)
    if (extension && !listed.has(extension)) setFilter({ ...filter, extensions: [...filter.extensions, extension] })
    setOther('')
  }
  const save = () => actions.run(async () => {
    await call('extensions:save', { rootId, filter })
    onSaved?.()
    return { text: t('toast.extensionsSaved') }
  })
  return (
    <div className="block">
      <h4>{title}</h4>
      <div className="segmented">
        <button type="button" className={filter.mode === 'deny' ? 'on' : ''} onClick={() => setFilter({ ...filter, mode: 'deny' })}>{t('settings.allBut')}</button>
        <button type="button" className={filter.mode === 'allow' ? 'on' : ''} onClick={() => setFilter({ ...filter, mode: 'allow' })}>{t('settings.onlyMarked')}</button>
      </div>
      {Object.entries(EXTENSION_GROUPS).map(([group, extensions]) => (
        <div className="row" key={group}>
          <span className="muted ext-group ellipsis" title={t(`extGroup.${group}` as Parameters<typeof t>[0])}>{t(`extGroup.${group}` as Parameters<typeof t>[0])}</span>
          <div className="chips">
            {extensions.map((extension) => <button type="button" key={extension} className={listed.has(extension) ? 'chip on' : 'chip'} onClick={() => toggle(extension)}>.{extension}</button>)}
          </div>
        </div>
      ))}
      {custom.length > 0 && (
        <div className="row">
          <span className="muted ext-group">{t('settings.ownExtensions')}</span>
          <div className="chips">{custom.map((extension) => <button type="button" key={extension} className="chip on" onClick={() => toggle(extension)}>.{extension} ×</button>)}</div>
        </div>
      )}
      <div className="row">
        <input value={other} placeholder={t('settings.otherExtension')} style={{ width: 220 }} onChange={(event) => setOther(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && add()} />
        <button className="btn small" type="button" onClick={add}>{t('settings.add')}</button>
        <span className="grow" />
        <button className="btn primary small" type="button" onClick={save}>{t('common.save')}</button>
      </div>
      <span className="hint">{t(filter.mode === 'deny' ? 'settings.markedSkipped' : 'settings.markedOnly')} {t('settings.filterKeeps')}</span>
    </div>
  )
}

function RootExtensionsDialog({ root, onClose }: { root: Root; onClose: () => void }) {
  const t = useText()
  const actions = useActions()
  const { data: globalFilter } = useBackend('extensions:get')
  const [own, setOwn] = useState(root.extensions !== null)
  const inherit = () => {
    onClose()
    actions.run(async () => {
      await call('extensions:save', { rootId: root.rootId, filter: null })
      return { text: t('toast.extensionsSaved') }
    })
  }
  const footer = <button className="btn primary" type="button" onClick={onClose}>{t('common.close')}</button>
  return (
    <Dialog title={t('settings.rootExtensions', { name: root.name })} wide footer={footer} onClose={onClose}>
      <div className="segmented">
        <button type="button" className={own ? '' : 'on'} onClick={inherit}>{t('settings.inherits')}</button>
        <button type="button" className={own ? 'on' : ''} onClick={() => setOwn(true)}>{t('settings.ownFilter')}</button>
      </div>
      {own && (root.extensions ?? globalFilter) && <ExtensionEditor title={root.path} rootId={root.rootId} initial={root.extensions ?? globalFilter!} onSaved={onClose} />}
    </Dialog>
  )
}
