import { readFileSync, statSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

// The link preview (#110): Discord showed the pre-redesign "cosmo.observatory" card
// with "observatory — NASA Live Data Dashboard" long after the site moved on.

const ROOT = join(import.meta.dirname, '..', '..')
const html = readFileSync(join(ROOT, 'index.html'), 'utf8')
const IMAGE = join(ROOT, 'public', 'og-image.png')
const MAX_BYTES = 300 * 1024

function meta(attr: 'property' | 'name', key: string): string | undefined {
  const re = new RegExp(`<meta\\s+${attr}="${key}"\\s+content="([^"]*)"`)
  return re.exec(html)?.[1]
}

describe('share image (#110)', () => {
  const png = readFileSync(IMAGE)

  it('is a real PNG, 1200 x 630', () => {
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(png.subarray(12, 16).toString('ascii')).toBe('IHDR')
    expect(png.readUInt32BE(16)).toBe(1200)
    expect(png.readUInt32BE(20)).toBe(630)
  })

  it('stays under 300 KB', () => {
    expect(statSync(IMAGE).size).toBeLessThan(MAX_BYTES)
  })
})

describe('share meta tags (#110)', () => {
  it('og and twitter point at the same image, with its size and type', () => {
    const url = 'https://observatory.geektechlive.com/og-image.png'
    expect(meta('property', 'og:image')).toBe(url)
    expect(meta('name', 'twitter:image')).toBe(url)
    expect(meta('property', 'og:image:width')).toBe('1200')
    expect(meta('property', 'og:image:height')).toBe('630')
    expect(meta('property', 'og:image:type')).toBe('image/png')
  })

  it('og and twitter carry the same title and description', () => {
    expect(meta('property', 'og:title')).toBeTruthy()
    expect(meta('name', 'twitter:title')).toBe(meta('property', 'og:title'))
    expect(meta('name', 'twitter:description')).toBe(meta('property', 'og:description'))
    expect(meta('name', 'twitter:image:alt')).toBe(meta('property', 'og:image:alt'))
  })

  it('names the five views', () => {
    const description = meta('property', 'og:description') ?? ''
    for (const view of ['Earth', 'Orrery', 'Sun', 'Sky', 'Orbit']) {
      expect(description).toContain(view)
    }
  })

  it('no head text says cosmo or uses an em dash', () => {
    const head = html.slice(0, html.indexOf('</head>'))
    const texts = [...head.matchAll(/content="([^"]*)"|<title>([^<]*)<\/title>/g)].map(
      (m) => m[1] ?? m[2] ?? '',
    )
    expect(texts.length).toBeGreaterThan(5)
    for (const text of texts) {
      expect(text.toLowerCase()).not.toContain('cosmo')
      expect(text).not.toContain('—')
    }
  })
})
