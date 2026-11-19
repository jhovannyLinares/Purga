import { createContext, useContext } from 'react'
import { translate, type Language, type TextKey } from '@shared/i18n'

/** Idioma activo para toda la interfaz: cada texto visible pasa por `useText()`. */
export const LanguageContext = createContext<Language>('es')

export type Translate = (key: TextKey, values?: Record<string, string | number>) => string

export function useText(): Translate {
  const language = useContext(LanguageContext)
  return (key, values) => translate(language, key, values)
}
