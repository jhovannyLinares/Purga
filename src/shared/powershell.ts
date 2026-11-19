import { join } from 'node:path'

/**
 * PowerShell por ruta absoluta: por nombre, Windows lo buscaría primero en la carpeta de la app, que en una
 * instalación por usuario puede escribir cualquier programa de ese usuario.
 */
export const POWERSHELL_EXE = join(process.env['SystemRoot'] ?? 'C:\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
