// Extrae el emblema de Púrga de sus láminas de origen: sin el texto «PÚRGA / APLICACIÓN DE BORRADO DE ARCHIVOS»
// y con el fondo vuelto transparente. Método copiado de Pika (build/icono.mjs de Pika).
// - build/logo-origen.jpg     (fondo oscuro) -> resources/logo.png      (tema oscuro, el de por defecto)
// - build/logo-dia-origen.jpg (fondo claro)  -> resources/logo-dia.png  (tema claro, convención de Nautilus)
// Uso: electron build/extraer-logo.mjs
import { app, BrowserWindow } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const OUTPUT_SIZE = 512
// aire alrededor del dibujo, como fracción del lado del cuadrado
const MARGIN = 0.04
// Zona del emblema en fracciones del origen: el escudo y sus partículas, por encima del texto. El borde de abajo
// corta antes del punto de la «Ú», que queda debajo de la cola del escudo.
// inkDistance: distancia al fondo desde la que un píxel es dibujo opaco; noiseDistance: por debajo, fondo puro.
// El fondo oscuro tiene viñeta (más claro al centro), por eso su noiseDistance es mayor.
const SOURCES = [
  { from: 'logo-origen.jpg', to: 'logo.png', area: { left: 0.33, top: 0.08, right: 0.68, bottom: 0.672, inkDistance: 80, noiseDistance: 30 } },
  { from: 'logo-dia-origen.jpg', to: 'logo-dia.png', area: { left: 0.33, top: 0.08, right: 0.68, bottom: 0.66, inkDistance: 70, noiseDistance: 14 } },
]

// Corre en la página. Igual que en Pika: inunda desde los bordes, separa el borde suavizado del fondo y recorta al contenido.
function extractDrawing(source, area, margin) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const left = Math.round(img.width * area.left)
      const top = Math.round(img.height * area.top)
      const width = Math.round(img.width * area.right) - left
      const height = Math.round(img.height * area.bottom) - top
      const crop = document.createElement('canvas')
      crop.width = width
      crop.height = height
      const cropContext = crop.getContext('2d')
      cropContext.drawImage(img, left, top, width, height, 0, 0, width, height)
      const image = cropContext.getImageData(0, 0, width, height)
      const pixels = image.data
      const background = [pixels[0], pixels[1], pixels[2]]
      const distance = (index) =>
        Math.max(...background.map((value, channel) => Math.abs(pixels[index * 4 + channel] - value)))

      const visited = new Uint8Array(width * height)
      const pending = []
      for (let x = 0; x < width; x++) pending.push(x, (height - 1) * width + x)
      for (let y = 0; y < height; y++) pending.push(y * width, y * width + width - 1)
      while (pending.length) {
        const index = pending.pop()
        if (visited[index] || distance(index) >= area.inkDistance) continue
        visited[index] = 1
        const opacity = Math.max(0, (distance(index) - area.noiseDistance) / (area.inkDistance - area.noiseDistance))
        for (let channel = 0; channel < 3; channel++) {
          const observed = pixels[index * 4 + channel]
          const unmixed = opacity > 0 ? (observed - background[channel] * (1 - opacity)) / opacity : 0
          pixels[index * 4 + channel] = Math.min(255, Math.max(0, unmixed))
        }
        pixels[index * 4 + 3] = Math.round(255 * opacity)
        const x = index % width
        if (x > 0) pending.push(index - 1)
        if (x < width - 1) pending.push(index + 1)
        if (index >= width) pending.push(index - width)
        if (index < width * (height - 1)) pending.push(index + width)
      }
      cropContext.putImageData(image, 0, 0)

      let minX = width, minY = height, maxX = 0, maxY = 0
      for (let index = 0; index < width * height; index++) {
        if (pixels[index * 4 + 3] === 0) continue
        const x = index % width
        const y = Math.floor(index / width)
        minX = Math.min(minX, x)
        maxX = Math.max(maxX, x)
        minY = Math.min(minY, y)
        maxY = Math.max(maxY, y)
      }
      const contentWidth = maxX - minX + 1
      const contentHeight = maxY - minY + 1
      const side = Math.round(Math.max(contentWidth, contentHeight) / (1 - 2 * margin))
      const square = document.createElement('canvas')
      square.width = square.height = side
      square
        .getContext('2d')
        .drawImage(crop, minX, minY, contentWidth, contentHeight, (side - contentWidth) / 2, (side - contentHeight) / 2, contentWidth, contentHeight)
      resolve(square.toDataURL('image/png'))
    }
    img.src = source
  })
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false })
  await win.loadURL('about:blank')
  const resources = join(here, '..', 'resources')
  mkdirSync(resources, { recursive: true })
  for (const { from, to, area } of SOURCES) {
    const source = 'data:image/jpeg;base64,' + readFileSync(join(here, from)).toString('base64')
    const drawing = await win.webContents.executeJavaScript(
      `(${extractDrawing.toString()})(${JSON.stringify(source)}, ${JSON.stringify(area)}, ${MARGIN})`)
    const resized = await win.webContents.executeJavaScript(`new Promise((ok) => {
      const img = new Image()
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = ${OUTPUT_SIZE}
        const context = canvas.getContext('2d')
        context.imageSmoothingQuality = 'high'
        context.drawImage(img, 0, 0, ${OUTPUT_SIZE}, ${OUTPUT_SIZE})
        ok(canvas.toDataURL('image/png'))
      }
      img.src = ${JSON.stringify(drawing)}
    })`)
    writeFileSync(join(resources, to), Buffer.from(resized.split(',')[1], 'base64'))
    console.log(`${from} -> resources/${to} (${OUTPUT_SIZE} px)`)
  }
  app.quit()
})
