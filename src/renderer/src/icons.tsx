import type { ReactNode } from 'react'

/** Íconos de trazo, en línea para no cargar una fuente de íconos: toman el color del texto (currentColor). */
const SIZE = 14

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg width={SIZE} height={SIZE} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

export const OpenIcon = () => <Svg><path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5M12 9.5v3.5a.5.5 0 0 1-.5.5h-8a.5.5 0 0 1-.5-.5v-8a.5.5 0 0 1 .5-.5H7" /></Svg>
export const FolderIcon = () => <Svg><path d="M2 4.5a1 1 0 0 1 1-1h3l1.5 1.5H13a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z" /></Svg>
export const MoreIcon = () => <Svg><circle cx="8" cy="3.5" r=".6" fill="currentColor" /><circle cx="8" cy="8" r=".6" fill="currentColor" /><circle cx="8" cy="12.5" r=".6" fill="currentColor" /></Svg>
export const InfoIcon = () => <Svg><circle cx="8" cy="8" r="6" /><path d="M8 7.5V11M8 5h.01" /></Svg>
