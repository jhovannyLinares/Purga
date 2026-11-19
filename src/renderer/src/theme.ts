import { useEffect, useState } from 'react'
import type { Preferences } from '@shared/preferences'
import logoNight from '../../../resources/logo.png'
import logoDay from '../../../resources/logo-dia.png'

export type ResolvedTheme = 'light' | 'dark'

const LIGHT_QUERY = '(prefers-color-scheme: light)'

/**
 * Tema efectivo: el elegido, o el de Windows si es «Sistema», que cambia en vivo si Windows cambia.
 * Lo aplica en `<html data-theme>`, que es lo que lee tokens.css.
 */
export function useResolvedTheme(preference: Preferences['theme']): ResolvedTheme {
  const [systemIsLight, setSystemIsLight] = useState(() => window.matchMedia(LIGHT_QUERY).matches)
  useEffect(() => {
    const query = window.matchMedia(LIGHT_QUERY)
    const update = () => setSystemIsLight(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])
  const systemTheme: ResolvedTheme = systemIsLight ? 'light' : 'dark'
  const theme = preference === 'system' ? systemTheme : preference
  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])
  return theme
}

/** El emblema se dibujó en dos versiones: la de noche sobre fondo oscuro y la de día sobre claro. */
export const logoFor = (theme: ResolvedTheme) => (theme === 'light' ? logoDay : logoNight)
