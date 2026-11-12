// Carpeta de prueba para la prueba de pantalla (P9) y para mirar la app a mano: descargas con origen, duplicados,
// borradores, residuos, un instalador y fotos parecidas. Datos de ejemplo: ningún archivo es real.
// Uso: node tests/e2e/fixture.mjs <carpeta-destino>
import { mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

const target = process.argv[2]
if (!target) {
  console.error('Uso: node tests/e2e/fixture.mjs <carpeta-destino>')
  process.exit(1)
}
const OLD = new Date('2026-01-10T10:00:00Z')
const LONG_NAME = 'informe_trimestral_de_ventas_por_region_y_canal_con_comparativo_anual_version_definitiva_revisada.pdf'

const files = {
  'Descargas/setup_zoom_6.2.exe': 'MZ instalador de ejemplo',
  'Descargas/factura_octubre.pdf': '%PDF-1.4 factura de ejemplo',
  'Descargas/factura_octubre (1).pdf': '%PDF-1.4 factura de ejemplo',
  'Descargas/dataset_ventas.zip': 'PK zip de ejemplo',
  'Descargas/descarga.crdownload': 'descarga a medias',
  'Descargas/WhatsApp Image 2026-08-02 at 10.14.33.jpeg': null,
  'Documentos/contrato_arriendo_2025.pdf': '%PDF-1.4 contrato de ejemplo',
  'Documentos/informe_q3_v2.docx': 'borrador v2',
  'Documentos/informe_q3_v3.docx': 'version 3',
  'Documentos/~$informe_q3_v3.docx': 'residuo de Word',
  'Documentos/notas.txt': 'linea 1\nlinea 2\nlinea 3\n',
  [`Documentos/${LONG_NAME}`]: '%PDF-1.4 nombre largo para probar recortes',
  'Fotos/IMG_20260802_101433.jpg': null
}
const OLD_FILES = ['Descargas/setup_zoom_6.2.exe', 'Descargas/dataset_ventas.zip', 'Descargas/descarga.crdownload', 'Documentos/informe_q3_v2.docx', 'Documentos/~$informe_q3_v3.docx']
const BROWSER_FILES = ['Descargas/setup_zoom_6.2.exe', 'Descargas/factura_octubre.pdf', 'Descargas/factura_octubre (1).pdf', 'Descargas/dataset_ventas.zip']

function scene(width, height) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="g"><stop offset="0" stop-color="#1060a0"/><stop offset="1" stop-color="#f0c040"/></linearGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/><circle cx="${width * 0.3}" cy="${height * 0.4}" r="${height * 0.2}" fill="#fff"/>
    <rect x="${width * 0.6}" y="${height * 0.5}" width="${width * 0.25}" height="${height * 0.3}" fill="#202020"/></svg>`
  return sharp(Buffer.from(svg))
}

rmSync(target, { recursive: true, force: true })
for (const [relative, content] of Object.entries(files)) {
  mkdirSync(join(target, relative, '..'), { recursive: true })
  if (content !== null) writeFileSync(join(target, relative), content)
}
await scene(1600, 1200).jpeg({ quality: 95 }).withExif({ IFD2: { DateTimeOriginal: '2026:08:02 10:14:33' } }).toFile(join(target, 'Fotos/IMG_20260802_101433.jpg'))
await scene(800, 600).jpeg({ quality: 60 }).toFile(join(target, 'Descargas/WhatsApp Image 2026-08-02 at 10.14.33.jpeg'))
for (const relative of BROWSER_FILES) writeFileSync(join(target, relative) + ':Zone.Identifier', '[ZoneTransfer]\r\nZoneId=3\r\nHostUrl=https://ejemplo.com/descarga\r\n')
for (const relative of OLD_FILES) utimesSync(join(target, relative), OLD, OLD)
console.log(`Carpeta de prueba en ${target}`)
