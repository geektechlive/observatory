/**
 * The Earth textures start with the page (#85). On a desktop-size screen, main.tsx
 * preloads the 2048 pair every tier draws first, for the views that draw the globe only
 * (#173); 4096 is never preloaded, because the tier is picked at runtime and a phone must
 * not pay for it. The preload only saves a download when it matches the texture loader's
 * request exactly: same URL and CORS mode (three's loaders default to crossOrigin
 * 'anonymous'), or the browser fetches the file twice (texture-preload-dynamic.test.ts).
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

import { globeTextures } from '@/lib/globe3d'
import { EARLY_TEXTURES_MEDIA } from '@/lib/texturePreload'

const ROOT = join(__dirname, '..', '..')
const html = readFileSync(join(ROOT, 'index.html'), 'utf8')
const headers = readFileSync(join(ROOT, 'public', '_headers'), 'utf8')

const imagePreloads = [...html.matchAll(/<link\b[^>]*>/g)]
  .map((m) => m[0])
  .filter((tag) => /rel="preload"/.test(tag) && /as="image"/.test(tag))

const href = (tag: string) => /href="([^"]+)"/.exec(tag)?.[1]

describe('Earth texture preload (#85, #173)', () => {
  it('draws the 2048 pair first on every tier, the pair the boot preload asks for', () => {
    expect(globeTextures({ textureWidth: 4096 }).first.width).toBe(2048)
  })

  // A static link can't see the hash: a desktop #orrery, #sun or #sky downloaded 310 kB of
  // Earth for nothing (#173). main.tsx's preloadTexturesAtBoot asks by view instead.
  it('preloads no texture from index.html', () => {
    expect(imagePreloads.map(href)).toEqual([])
  })

  it('never preloads a 4096 texture', () => {
    expect(html).not.toContain('4096')
    expect(headers).not.toContain('4096')
  })

  it('starts the boot preload from the entry, before React renders', () => {
    const main = readFileSync(join(ROOT, 'src', 'main.tsx'), 'utf8')
    const boot = main.indexOf('preloadTexturesAtBoot(window.location.hash)')
    expect(boot).toBeGreaterThan(-1)
    expect(boot).toBeLessThan(main.indexOf('createRoot('))
  })

  it('starts on desktop-size screens only, so a phone keeps its bandwidth for the app', () => {
    // On a 4G phone the early 310 kB pulled the app's first paint back ~160 ms (#85).
    expect(EARLY_TEXTURES_MEDIA).toBe('(min-width: 900px)')
  })

  it('sends no texture Link header: a header cannot be limited by screen size', () => {
    expect(headers).not.toMatch(/Link:.*textures/)
  })
})
