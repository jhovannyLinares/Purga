import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { open } from 'node:fs/promises'

/**
 * Huellas de contenido (F-8, §5.3). La parcial lee el principio y el final: separa casi todos los archivos de igual
 * tamaño sin leerlos enteros; la completa confirma el duplicado.
 */
const PARTIAL_BLOCK_BYTES = 64 * 1024

export async function partialHash(path: string): Promise<string> {
  const handle = await open(path, 'r')
  try {
    const { size } = await handle.stat()
    const hash = createHash('sha256').update(String(size))
    const head = Buffer.alloc(Math.min(PARTIAL_BLOCK_BYTES, size))
    await handle.read(head, 0, head.length, 0)
    hash.update(head)
    if (size > PARTIAL_BLOCK_BYTES) {
      const tail = Buffer.alloc(Math.min(PARTIAL_BLOCK_BYTES, size - PARTIAL_BLOCK_BYTES))
      await handle.read(tail, 0, tail.length, size - tail.length)
      hash.update(tail)
    }
    return hash.digest('hex')
  } finally {
    await handle.close()
  }
}

export function fullHash(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256')
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', () => resolve(hash.digest('hex')))
  })
}
