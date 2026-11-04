/**
 * Phones skip index.html's texture preload (#85), so their Earth pictures used to wait
 * for the renderer chunk (#87). preloadTextures starts them alongside it, with the same
 * attributes as the static links, so the texture loader reuses the download.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { globeTextures } from '@/lib/globe3d'
import { preloadTextures } from '@/lib/texturePreload'

const pair = globeTextures({ textureWidth: 2048 }).first
const links = () => [...document.head.querySelectorAll<HTMLLinkElement>('link[rel="preload"]')]

const stubScreen = (wide: boolean) => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({ matches: wide && query === '(min-width: 900px)', media: query })),
  )
}

const addStatic = (href: string) => {
  const link = document.createElement('link')
  link.rel = 'preload'
  link.as = 'image'
  link.href = href
  link.media = '(min-width: 900px)'
  document.head.append(link)
}

describe('preloadTextures (#87)', () => {
  afterEach(() => {
    document.head.innerHTML = ''
    vi.unstubAllGlobals()
  })

  it('adds a preload per texture in the CORS mode the texture loader uses', () => {
    stubScreen(false)
    preloadTextures(pair)
    const added = links()
    expect(added.map((l) => l.getAttribute('href'))).toEqual([pair.day, pair.night])
    for (const link of added) {
      expect(link.getAttribute('as')).toBe('image')
      expect(link.getAttribute('type')).toBe('image/webp')
      expect(link.getAttribute('crossorigin')).toBe('anonymous')
      expect(link.hasAttribute('media')).toBe(false)
    }
  })

  it('adds nothing on a wide screen, where the static preload already runs', () => {
    stubScreen(true)
    addStatic(pair.day)
    addStatic(pair.night)
    preloadTextures(pair)
    expect(links()).toHaveLength(2)
  })

  it('still adds them on a narrow screen, where the static preload does not apply', () => {
    stubScreen(false)
    addStatic(pair.day)
    addStatic(pair.night)
    preloadTextures(pair)
    expect(links()).toHaveLength(4)
  })

  it('adds each texture once, however often it is called', () => {
    stubScreen(false)
    preloadTextures(pair)
    preloadTextures(pair)
    expect(links()).toHaveLength(2)
  })
})
