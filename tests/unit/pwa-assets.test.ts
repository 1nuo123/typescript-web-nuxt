import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const readPngDimensions = (path: string): { width: number; height: number } => {
  const bytes = readFileSync(path)
  expect(bytes.subarray(0, 8)).toEqual(
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  )
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  }
}

describe('PWA install assets', () => {
  it.each([192, 512])('provides a real %ix%i PNG icon', (size) => {
    const path = fileURLToPath(
      new URL(`../../public/icon-${size}.png`, import.meta.url),
    )

    expect(readPngDimensions(path)).toEqual({ width: size, height: size })
  })

  it('declares both install icon sizes in the manifest configuration', () => {
    const config = readFileSync(
      fileURLToPath(new URL('../../nuxt.config.ts', import.meta.url)),
      'utf8',
    )

    expect(config).toContain("src: '/icon-192.png'")
    expect(config).toContain("sizes: '192x192'")
    expect(config).toContain("src: '/icon-512.png'")
    expect(config).toContain("sizes: '512x512'")
    expect(config).toContain("purpose: 'any maskable'")
  })
})
