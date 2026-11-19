import { useCallback, useContext, useEffect, useRef, useState, type MouseEvent } from 'react'
import { EMPTY_FILTERS, type SavedSearch, type SearchFilters } from '@shared/filters'
import type { HelpTopic } from '@shared/help'
import { resolveLanguage, type TextKey } from '@shared/i18n'
import type { ScanState } from '@shared/ipc-contracts'
import type { FileRow, Root } from '@shared/model'
import { DEFAULT_PREFERENCES, type Preferences } from '@shared/preferences'
import { AboutDialog } from './AboutDialog'
import { TableLayoutsContext, type TableLayouts } from './ColumnTable'
import { ActionsProvider, useActions } from './actions'
import { call, errorText, onAppEvent } from './api'
import { IndexVersion, useBackend } from './data'
import { DetailPanel } from './DetailPanel'
import { ExplorerDialog } from './ExplorerDialog'
import { formatBytes } from './format'
import { HelpDialog } from './HelpDialog'
import { Menubar, shortcutOf, type Menu } from './Menubar'
import { SettingsView } from './SettingsView'
import { LanguageContext, useText, type Translate } from './text'
import { logoFor, useResolvedTheme } from './theme'
import { Empty, MenuPanel, type MenuPlace } from './ui'
import { ExploreView } from './views/ExploreView'
import { PhotosView } from './views/PhotosView'
import { ProposalsView } from './views/ProposalsView'
import { ScheduledView } from './views/ScheduledView'
import { SearchView } from './views/SearchView'
import { RulesView } from './views/RulesView'
import { DuplicatesView, ExpiryView } from './views/SmallViews'
import { SummaryView } from './views/SummaryView'

type View = 'summary' | 'explore' | 'proposals' | 'scheduled' | 'duplicates' | 'photos' | 'expiry' | 'search' | 'rules' | 'settings'

/** Vistas de la columna izquierda, en el orden de la maqueta (lámina 4). */
const NAV_VIEWS: [View, TextKey][] = [
  ['summary', 'nav.summary'],
  ['explore', 'nav.explore'],
  ['proposals', 'nav.proposals'],
  ['scheduled', 'nav.scheduled'],
  ['duplicates', 'nav.duplicates'],
  ['photos', 'nav.photos'],
  ['expiry', 'nav.expiry']
]

export function App() {
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [indexVersion, setIndexVersion] = useState(0)
  const [scanState, setScanState] = useState<ScanState>({ running: false, rootId: null, lastScanAt: null })
  const language = resolveLanguage(preferences.language, navigator.language)
  const theme = useResolvedTheme(preferences.theme)

  useEffect(() => {
    call('prefs:load')
      .then(setPreferences, (error: unknown) => setLoadError(errorText(error)))
      .finally(() => void window.purga.ready())
    call('roots:scanState').then(setScanState, () => undefined)
    return onAppEvent((event) => {
      if (event.type === 'prefs:changed') setPreferences(event.preferences)
      if (event.type === 'index:changed') setIndexVersion((version) => version + 1)
      if (event.type === 'scan:state') setScanState(event.state)
    })
  }, [])

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  return (
    <LanguageContext.Provider value={language}>
      <IndexVersion.Provider value={indexVersion}>
        <ActionsProvider>
          <Shell preferences={preferences} logo={logoFor(theme)} loadError={loadError} scanState={scanState} />
        </ActionsProvider>
      </IndexVersion.Provider>
    </LanguageContext.Provider>
  )
}

type PhotoTab = 'similar' | 'bydate'

interface ShellProps {
  preferences: Preferences
  logo: string
  loadError: string | null
  scanState: ScanState
}

function Shell({ preferences, logo, loadError, scanState }: ShellProps) {
  const t = useText()
  const language = useContext(LanguageContext)
  const actions = useActions()
  const [view, setView] = useState<View>('summary')
  const [rootId, setRootId] = useState<number | null>(null)
  const [rootMenu, setRootMenu] = useState<{ root: Root; place: MenuPlace } | null>(null)
  const [detail, setDetail] = useState<FileRow | null>(null)
  const [filters, setFilters] = useState<SearchFilters>(EMPTY_FILTERS)
  const [saved, setSaved] = useState<SavedSearch | null>(null)
  const [photoTab, setPhotoTab] = useState<PhotoTab>('similar')
  const [aboutOpen, setAboutOpen] = useState(false)
  const [help, setHelp] = useState<HelpTopic | null>(null)
  const [explorerPaths, setExplorerPaths] = useState<string[] | null>(null)
  const searchInput = useRef<HTMLInputElement>(null)
  const { data: paths } = useBackend('paths:info')
  const { data: roots } = useBackend('roots:list')
  const { data: summary } = useBackend('summary:get')
  const { data: searches } = useBackend('searches:list')
  const rootList = roots ?? []
  const empty = roots !== null && rootList.length === 0
  const currentRoot = rootList.find((root) => root.rootId === rootId) ?? rootList[0] ?? null

  // F-13: lo que llega con el diálogo abierto se suma a él; un solo diálogo y un solo lote
  useEffect(() => window.purga.onExplorerRequest((incoming) => {
    if (!Array.isArray(incoming)) return
    setExplorerPaths((current) => [...new Set([...(current ?? []), ...(incoming as string[])])])
  }), [])

  const go = useCallback((next: View) => {
    setView(next)
    setDetail(null)
  }, [])
  const savePreferences = (next: Preferences) => actions.run(async () => {
    await call('prefs:save', next)
    return null
  })
  // columnas y anchos de cada tabla: van a las preferencias, así se mantienen al reiniciar
  const tableLayouts: TableLayouts = {
    layouts: preferences.tableLayouts,
    save: (tableId, layout) => savePreferences({ ...preferences, tableLayouts: { ...preferences.tableLayouts, [tableId]: layout } })
  }
  const addRoot = () => actions.run(async () => {
    const folder = await window.purga.pickFolder()
    if (!folder) return null
    const id = await call('roots:add', { path: folder })
    setRootId(id)
    setView('explore')
    return { text: t('toast.rootAdded') }
  })
  const exportMarks = () => actions.run(async () => {
    const target = await window.purga.pickSaveJson('purga-marcas.json')
    if (!target) return null
    const count = await call('marks:export', { path: target })
    return { text: t('toast.exported', { count }) }
  })
  const importMarks = () => actions.run(async () => {
    const source = await window.purga.pickOpenJson()
    if (!source) return null
    const result = await call('marks:import', { path: source }).catch(() => {
      // el motivo exacto queda en el registro del backend; aquí basta con decir que el archivo no sirve
      throw new Error(t('toast.importInvalid'))
    })
    return { text: t('toast.imported', { matched: result.matched, unmatched: result.unmatched }) }
  })
  const runSearch = (next: SearchFilters, savedSearch: SavedSearch | null = null) => {
    setFilters(next)
    setSaved(savedSearch)
    go('search')
  }
  const detailFiles = detail ? [detail] : []
  const menus = buildMenus(t, {
    go,
    addRoot,
    scan: () => void call('roots:scan', { rootId: null }),
    exportMarks,
    importMarks,
    hide: () => void window.purga.hide(),
    quit: () => void window.purga.quit(),
    find: () => searchInput.current?.focus(),
    selectAll: () => document.querySelector<HTMLInputElement>('.tr.th input[type="checkbox"]')?.click(),
    keep: detail ? () => actions.mark(detailFiles, 'keep') : undefined,
    deleteOn: detail ? () => actions.mark(detailFiles, 'deleteOn') : undefined,
    undo: () => actions.undo(null),
    photos: (tab) => {
      setPhotoTab(tab)
      go('photos')
    },
    dailyPass: () => void call('dailyPass:run'),
    help: setHelp,
    openAbout: () => setAboutOpen(true)
  })
  useMenuShortcuts(menus)

  const counts: Partial<Record<View, number>> = summary ? { proposals: summary.proposals, scheduled: summary.scheduled, duplicates: summary.duplicateGroups, expiry: summary.expiring } : {}
  const scanningRoot = rootList.find((root) => root.rootId === scanState.rootId)
  const status = scanState.running
    ? <><span className="dot tone-warn spinner-dot" />{t('status.scanning', { name: scanningRoot?.name ?? '…' })}</>
    : empty ? <><span className="dot tone-off" />{t('status.noRoots')}</> : <><span className="dot tone-ok" />{t('status.upToDate', { count: rootList.length })}</>
  const viewProps = { detailId: detail?.fileId ?? null, onDetail: setDetail }

  const renderView = () => {
    if (view === 'settings') return <SettingsView preferences={preferences} dataDir={paths?.dataDir ?? ''} roots={rootList} onChange={savePreferences} />
    if (view === 'rules') return <RulesView />
    if (empty) return <FirstUse logo={logo} onAdd={addRoot} />
    switch (view) {
      case 'summary': return <SummaryView {...viewProps} />
      case 'explore': return <ExploreView {...viewProps} root={currentRoot} logo={logo} />
      case 'proposals': return <ProposalsView {...viewProps} logo={logo} />
      case 'scheduled': return <ScheduledView {...viewProps} />
      case 'duplicates': return <DuplicatesView {...viewProps} logo={logo} />
      case 'photos': return <PhotosView {...viewProps} tab={photoTab} onTab={setPhotoTab} roots={rootList} rootId={currentRoot?.rootId ?? null} logo={logo} />
      case 'expiry': return <ExpiryView {...viewProps} logo={logo} />
      case 'search': return <SearchView {...viewProps} filters={filters} onFilters={(next) => runSearch(next)} saved={saved} roots={rootList} />
    }
  }

  return (
    <TableLayoutsContext.Provider value={tableLayouts}>
    <div className="app">
      <div className="topbar">
        <span className="brand"><img className="logo" src={logo} alt="" />Purga</span>
        <Menubar menus={menus} />
        <span className="topbar-status">{status}</span>
      </div>
      <div className="toolbar">
        <input ref={searchInput} className="search" placeholder={t('toolbar.search')} disabled={empty} defaultValue=""
          onKeyDown={(event) => event.key === 'Enter' && runSearch({ ...EMPTY_FILTERS, text: event.currentTarget.value })} />
        <button className={view === 'search' ? 'btn on' : 'btn'} type="button" disabled={empty} onClick={() => runSearch(filters, saved)}>{t('toolbar.filters')}</button>
        <button className="btn primary" type="button" onClick={addRoot}>{t('toolbar.addRoot')}</button>
        <button className="btn" type="button" disabled={empty || scanState.running} onClick={() => void call('roots:scan', { rootId: null })}>{t('toolbar.scan')}</button>
      </div>
      <div className="body">
        <nav className="nav" aria-label={t('nav.views')}>
          <span className="section-label">{t('nav.views')}</span>
          {NAV_VIEWS.map(([id, label]) => (
            <NavItem key={id} label={t(label)} count={empty ? undefined : counts[id]} active={view === id} onClick={() => go(id)} />
          ))}
          <div className="nav-divider" />
          <span className="section-label">{t('nav.savedSearches')}</span>
          {(searches ?? []).length === 0 && <span className="hint nav-hint">{t('nav.noSearches')}</span>}
          {(searches ?? []).map((search) => (
            <NavItem key={search.searchId} label={search.name} active={view === 'search' && saved?.searchId === search.searchId} onClick={() => runSearch(search.filters, search)} />
          ))}
          <div className="nav-divider" />
          <span className="section-label">{t('nav.roots')}</span>
          {empty && <span className="hint nav-hint">{t('nav.noRoots')}</span>}
          {rootList.map((root) => (
            <NavItem key={root.rootId} label={root.name} title={root.path} count={root.files} active={view === 'explore' && currentRoot?.rootId === root.rootId} onClick={() => {
              setRootId(root.rootId)
              go('explore')
            }} onContextMenu={(event) => {
              event.preventDefault()
              event.stopPropagation()
              setRootMenu({ root, place: { top: event.clientY, left: event.clientX } })
            }} />
          ))}
          <div className="nav-divider" />
          <NavItem label={t('nav.settings')} active={view === 'settings'} onClick={() => go('settings')} />
        </nav>
        <section className="list">
          {loadError && <div className="notice warn">{loadError}</div>}
          {renderView()}
        </section>
        <DetailPanel fileId={view === 'settings' || view === 'rules' ? null : detail?.fileId ?? null} />
      </div>
      <div className="statusbar">
        {empty ? <span>{t('status.addFirst')}</span> : (
          <>
            <span>{scanState.lastScanAt ? t('status.lastScan', { time: new Date(scanState.lastScanAt).toLocaleTimeString(language, { hour: '2-digit', minute: '2-digit' }) }) : t('status.scanPending')}</span>
            {summary && <span>{t('status.duplicates', { count: summary.duplicateGroups })}</span>}
            {summary && <span className="statusbar-right">{t('status.scheduled', { count: summary.scheduled, size: formatBytes(summary.scheduledBytes, language) })}</span>}
          </>
        )}
      </div>
      {rootMenu && (
        <MenuPanel place={rootMenu.place} onClose={() => setRootMenu(null)} items={[
          { label: t('file.openFolder'), action: () => void window.purga.openFolder(rootMenu.root.path) },
          null,
          { label: t('explore.stopWatching'), hint: t('roots.unwatchHint'), action: () => actions.unwatch(rootMenu.root) }
        ]} />
      )}
      {aboutOpen && <AboutDialog logo={logo} onClose={() => setAboutOpen(false)} />}
      {help && <HelpDialog topic={help} logFile={paths?.logFile ?? ''} onClose={() => setHelp(null)} />}
      {explorerPaths && <ExplorerDialog paths={explorerPaths} onClose={() => setExplorerPaths(null)} />}
    </div>
    </TableLayoutsContext.Provider>
  )
}

function NavItem({ label, count, title, active, onClick, onContextMenu }: { label: string; count?: number; title?: string; active: boolean; onClick: () => void; onContextMenu?: (event: MouseEvent<HTMLButtonElement>) => void }) {
  return (
    <button type="button" className={active ? 'nav-item on' : 'nav-item'} title={title} onClick={onClick} onContextMenu={onContextMenu}>
      <span className="ellipsis" title={label}>{label}</span>
      {count ? <span className="count">{count}</span> : null}
    </button>
  )
}

/** Primer uso: sin carpetas vigiladas (lámina 4, escenario «Primer uso»). */
function FirstUse({ logo, onAdd }: { logo: string; onAdd: () => void }) {
  const t = useText()
  return (
    <Empty logo={logo} title={t('empty.firstTitle')} text={t('empty.firstText')}>
      <button className="btn primary big" type="button" onClick={onAdd}>{t('empty.firstAction')}</button>
    </Empty>
  )
}

interface MenuActions {
  go: (view: View) => void
  addRoot: () => void
  scan: () => void
  exportMarks: () => void
  importMarks: () => void
  hide: () => void
  quit: () => void
  find: () => void
  selectAll: () => void
  keep?: () => void
  deleteOn?: () => void
  undo: () => void
  photos: (tab: PhotoTab) => void
  dailyPass: () => void
  help: (topic: HelpTopic) => void
  openAbout: () => void
}

/** Menús de la maqueta (lámina 4). Una opción sin acción se ve deshabilitada. */
function buildMenus(t: Translate, actions: MenuActions): Menu[] {
  return [
    {
      title: t('menu.file'),
      items: [
        { label: t('menu.addRoot'), shortcut: 'Ctrl+O', action: actions.addRoot },
        { label: t('menu.scan'), shortcut: 'F5', action: actions.scan },
        null,
        { label: t('menu.exportMarks'), action: actions.exportMarks },
        { label: t('menu.importMarks'), action: actions.importMarks },
        null,
        { label: t('menu.closeToTray'), shortcut: 'Ctrl+W', action: actions.hide },
        { label: t('menu.quit'), shortcut: 'Alt+F4', action: actions.quit }
      ]
    },
    {
      title: t('menu.edit'),
      items: [
        { label: t('menu.find'), shortcut: 'Ctrl+F', action: actions.find },
        { label: t('menu.selectAll'), shortcut: 'Ctrl+A', action: actions.selectAll },
        null,
        { label: t('menu.keep'), shortcut: 'Ctrl+K', action: actions.keep },
        { label: t('menu.deleteOn'), shortcut: 'Ctrl+D', action: actions.deleteOn },
        { label: t('menu.undoBatch'), shortcut: 'Ctrl+Z', action: actions.undo }
      ]
    },
    {
      title: t('menu.view'),
      items: [
        { label: t('nav.summary'), shortcut: 'Ctrl+1', action: () => actions.go('summary') },
        { label: t('nav.explore'), shortcut: 'Ctrl+2', action: () => actions.go('explore') },
        { label: t('nav.proposals'), shortcut: 'Ctrl+3', action: () => actions.go('proposals') },
        { label: t('nav.scheduled'), shortcut: 'Ctrl+4', action: () => actions.go('scheduled') }
      ]
    },
    {
      title: t('menu.tools'),
      items: [
        { label: t('nav.duplicates'), action: () => actions.go('duplicates') },
        { label: t('menu.similarPhotos'), action: () => actions.photos('similar') },
        { label: t('menu.photosByDate'), action: () => actions.photos('bydate') },
        { label: t('nav.expiry'), action: () => actions.go('expiry') },
        { label: t('menu.rules'), action: () => actions.go('rules') },
        { label: t('menu.dailyPass'), action: actions.dailyPass },
        null,
        { label: t('menu.settings'), shortcut: 'Ctrl+,', action: () => actions.go('settings') }
      ]
    },
    {
      title: t('menu.help'),
      items: [
        { label: t('menu.guide'), shortcut: 'F1', action: () => actions.help('guide') },
        { label: t('menu.goodToKnow'), action: () => actions.help('goodToKnow') },
        { label: t('menu.releaseNotes'), action: () => actions.help('releaseNotes') },
        { label: t('menu.log'), action: () => actions.help('log') },
        null,
        { label: t('menu.about'), action: actions.openAbout }
      ]
    }
  ]
}

/** Los atajos de edición (Ctrl+A, Ctrl+Z, Ctrl+F…) dentro de un campo de texto son los del campo, no los del menú. */
function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
}

/** Los atajos que muestra el menú funcionan también con el menú cerrado, si la opción tiene acción. */
function useMenuShortcuts(menus: Menu[]): void {
  useEffect(() => {
    const byShortcut = new Map<string, () => void>()
    for (const menu of menus) {
      for (const item of menu.items) {
        if (item?.shortcut && item.action) byShortcut.set(item.shortcut, item.action)
      }
    }
    const runShortcut = (event: KeyboardEvent) => {
      const shortcut = shortcutOf(event)
      const action = byShortcut.get(shortcut)
      if (!action || (isTyping(event.target) && !/^F\d+$/.test(shortcut))) return
      if (document.querySelector('.backdrop')) return
      event.preventDefault()
      action()
    }
    document.addEventListener('keydown', runShortcut)
    return () => document.removeEventListener('keydown', runShortcut)
  }, [menus])
}
