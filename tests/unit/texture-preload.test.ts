/**
 * The Earth textures start with the page (#85). index.html preloads the 2048 pair
 * every tier draws first; 4096 is never preloaded, because the tier is picked at
 * runtime and a phone must not pay for it. The preload only saves a download when it
 * matches the texture loader's request exactly: same URL and CORS mode (three's
 * loaders default to crossOrigin 'anonymous'), or the browser fetches the file twice.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

import { globeTextures } from '@/lib/globe3d'

const ROOT = join(__dirname, '..', '..')
const html = readFileSync(join(ROOT, 'index.html'), 'utf8')
const headers = readFileSync(join(ROOT, 'public', '_headers'), 'utf8')

const imagePreloads = [...html.matchAll(/<link\b[^>]*>/g)]
  .map((m) => m[0])
  .filter((tag) => /rel="preload"/.test(tag) && /as="image"/.test(tag))

const href = (tag: string) => /href="([^"]+)"/.exec(tag)?.[1]

describe('Earth texture preload (#85)', () => {
  const first = globeTextures({ textureWidth: 4096 }).first

  it('preloads exactly the 2048 pair the globe draws first', () => {
    expect(imagePreloads.map(href)).toEqual([first.day, first.night])
  })

  it('never preloads a 4096 texture', () => {
    expect(html).not.toContain('4096')
    expect(headers).not.toContain('4096')
  })

  it('preloads in the CORS mode the texture loader uses, so nothing downloads twice', () => {
    for (const tag of imagePreloads) {
      expect(tag).toMatch(/\scrossorigin(\s|>|\/|="anonymous")/)
      expect(tag).toContain('type="image/webp"')
    }
  })

  it('preloads on desktop-size screens only, so a phone keeps its bandwidth for the app', () => {
    // On a 4G phone the early 310 kB pulled the app's first paint back ~160 ms (#85).
    for (const tag of imagePreloads) expect(tag).toContain('media="(min-width: 900px)"')
  })

  it('sends no texture Link header: a header cannot be limited by screen size', () => {
    expect(headers).not.toMatch(/Link:.*textures/)
  })
})
