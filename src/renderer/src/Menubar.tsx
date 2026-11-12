import { useEffect, useState } from 'react'

export interface MenuItem {
  label: string
  shortcut?: string
  /** sin acción, la opción se ve deshabilitada: llega en una fase siguiente */
  action?: () => void
}
/** `null` es un separador. */
export type Menu = { title: string; items: (MenuItem | null)[] }

/** Barra de menús propia de la familia: título → panel con opciones y atajos. Se cierra con un clic fuera o Escape. */
export function Menubar({ menus }: { menus: Menu[] }) {
  const [openTitle, setOpenTitle] = useState<string | null>(null)
  useEffect(() => {
    if (!openTitle) return
    const close = () => setOpenTitle(null)
    const closeOnEscape = (event: KeyboardEvent) => event.key === 'Escape' && close()
    document.addEventListener('click', close)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [openTitle])

  const choose = (item: MenuItem) => {
    setOpenTitle(null)
    item.action?.()
  }

  return (
    <div className="menubar" role="menubar">
      {menus.map((menu) => (
        <div className="menubar-entry" key={menu.title}>
          <button
            type="button"
            className={openTitle === menu.title ? 'menubar-title on' : 'menubar-title'}
            onClick={(event) => {
              event.stopPropagation()
              setOpenTitle(openTitle === menu.title ? null : menu.title)
            }}
          >
            {menu.title}
          </button>
          {openTitle === menu.title && (
            <div className="ctx menubar-panel" role="menu">
              {menu.items.map((item, index) =>
                item ? (
                  <button type="button" role="menuitem" key={item.label} disabled={!item.action} onClick={(event) => {
                    event.stopPropagation()
                    choose(item)
                  }}>
                    {item.label}
                    <span className="ctx-key">{item.shortcut ?? ''}</span>
                  </button>
                ) : (
                  <div className="ctx-separator" key={`separator-${index}`} />
                )
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

/** El atajo de una tecla con el mismo texto que muestra el menú («Ctrl+,», «F1»). */
export function shortcutOf(event: KeyboardEvent): string {
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key
  return event.ctrlKey ? `Ctrl+${key}` : key
}
