import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vitest/config'

/** `?asset` lo resuelve electron-vite al construir; en los tests es la ruta del archivo en el repo. */
const assetPaths: Plugin = {
  name: 'purga-asset-paths',
  enforce: 'pre',
  resolveId(source, importer) {
    if (!source.endsWith('?asset') || !importer) return null
    return `\0asset:${resolve(importer, '..', source.slice(0, -'?asset'.length))}`
  },
  load(id) {
    return id.startsWith('\0asset:') ? `export default ${JSON.stringify(id.slice('\0asset:'.length))}` : null
  }
}

export default defineConfig({
  plugins: [assetPaths],
  resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } },
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    testTimeout: 60_000
  }
})
