/**
 * Qué archivos no se abren desde Purga. «Abrir» usa el programa predeterminado de Windows, y para estos tipos ese
 * programa es el propio archivo: abrirlo lo ejecuta. Para ellos solo se ofrece «Mostrar en carpeta».
 */
const RUNS_WHEN_OPENED = ['exe', 'msi', 'bat', 'cmd', 'com', 'ps1', 'vbs', 'vbe', 'js', 'jse', 'wsf', 'wsh', 'scr', 'pif', 'lnk', 'hta', 'cpl', 'msc', 'reg', 'jar', 'appx', 'msix']

export function runsWhenOpened(name: string): boolean {
  const dot = name.lastIndexOf('.')
  if (dot < 0) return false
  return RUNS_WHEN_OPENED.includes(name.slice(dot + 1).toLowerCase())
}
