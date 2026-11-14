import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildUrl, useHashView } from '@/hooks/useHashView'
import type { ConsoleView } from '@/lib/viewRoute'
import { DEFAULT_LAYERS, LAYER_KEYS, type LayerKey, layersFromHash, useUiStore } from '@/store/ui'

describe('layersFromHash (#176)', () => {
  it('turns on exactly the listed layers and every other one off', () => {
    const layers = layersFromHash('#orbit?layers=fires,quakes')
    expect(layers).toEqual({
      ...Object.fromEntries(LAYER_KEYS.map((k) => [k, false])),
      fires: true,
      quakes: true,
    })
  })

  it('ignores unknown names and blanks', () => {
    expect(layersFromHash('#/earth?layers=fires,,nope')?.fires).toBe(true)
  })

  // A link that names no real layer must not turn every layer off (and save that).
  it.each([
    '',
    '#earth',
    '#earth?t=1',
    '#orrery?focus=Mars',
    '#earth?layers=',
    '#earth?layers=nope',
  ])('gives null when %j says nothing about layers', (hash) => {
    expect(layersFromHash(hash)).toBeNull()
  })
})

describe('the store starts on the hash layers (#176)', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/')
    localStorage.clear()
    vi.resetModules()
  })

  async function freshStore() {
    vi.resetModules()
    const { useUiStore } = await import('@/store/ui')
    return useUiStore.getState().layers
  }

  it('takes a layers link before anything renders', async () => {
    window.history.replaceState(null, '', '/orbit/#layers=fires')
    const layers = await freshStore()
    expect(layers.fires).toBe(true)
    expect(layers.aurora).toBe(false)
    expect(layers.iss).toBe(false)
  })

  it('puts a layers link over saved preferences', async () => {
    localStorage.setItem(
      'observatory-ui',
      JSON.stringify({ state: { layers: { ...DEFAULT_LAYERS, gibs: true } }, version: 1 }),
    )
    window.history.replaceState(null, '', '/#layers=fires')
    const layers = await freshStore()
    expect(layers.fires).toBe(true)
    expect(layers.gibs).toBe(false)
    expect(layers.aurora).toBe(false)
  })

  it('keeps saved preferences when the link names no layers', async () => {
    localStorage.setItem(
      'observatory-ui',
      JSON.stringify({ state: { layers: { gibs: true } }, version: 1 }),
    )
    window.history.replaceState(null, '', '/#earth')
    const layers = await freshStore()
    expect(layers.gibs).toBe(true)
    expect(layers.aurora).toBe(DEFAULT_LAYERS.aurora)
  })

  it('keeps saved preferences when the link names only unknown layers', async () => {
    localStorage.setItem(
      'observatory-ui',
      JSON.stringify({ state: { layers: { gibs: true } }, version: 1 }),
    )
    window.history.replaceState(null, '', '/#earth?layers=nope')
    const layers = await freshStore()
    expect(layers.gibs).toBe(true)
    expect(layers.iss).toBe(DEFAULT_LAYERS.iss)
  })
})

describe('useHashView on mount (#176)', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    window.history.replaceState(null, '', '/')
    localStorage.clear()
  })

  function savesOnMount(hash: string): number {
    window.history.replaceState(null, '', `/${hash}`)
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    renderHook(() => {
      useHashView()
    })
    return setItem.mock.calls.filter(([key]) => key === 'observatory-ui').length
  }

  it("saves a link's layers in one write, not one per layer", () => {
    expect(savesOnMount('#earth?layers=fires')).toBe(1)
    expect(useUiStore.getState().layers.fires).toBe(true)
  })

  it('saves nothing for a link that names no real layer', () => {
    useUiStore.setState({ layers: { ...DEFAULT_LAYERS, gibs: true } })
    expect(savesOnMount('#earth?layers=nope')).toBe(0)
    expect(useUiStore.getState().layers.gibs).toBe(true)
  })
})

describe('buildUrl (#109, ADR 0036)', () => {
  const someOn = Object.fromEntries(
    LAYER_KEYS.map((k) => [k, k === 'iss' || k === 'quakes']),
  ) as Record<LayerKey, boolean>
  const at = (view: ConsoleView | null, params = '') => ({ view, params })

  it('keeps the globe layers on Earth and Orbit', () => {
    expect(buildUrl('earth', someOn)).toBe('/#layers=iss,quakes')
    expect(buildUrl('orbit', someOn)).toBe('/orbit/#layers=iss,quakes')
  })

  // The layers are the Earth globe's and map's; the other tabs never show them, so
  // they only cluttered a shared orrery, Sun or sky link.
  it.each([
    ['orrery', '/orrery/'],
    ['sun', '/sun/'],
    ['sky', '/sky/'],
  ] as const)('writes no layers on %s', (view, path) => {
    expect(buildUrl(view, someOn)).toBe(path)
  })

  describe('keeps the orrery deep link (#108)', () => {
    const link = at('orrery', 't=2012-08-25T00:00:00Z&focus=naif:-31&preset=earth')

    it('keeps an orrery link as it is, encoding untouched', () => {
      expect(buildUrl('orrery', someOn, link)).toBe(
        '/orrery/#t=2012-08-25T00:00:00Z&focus=naif:-31&preset=earth',
      )
    })

    it('drops anything but the orrery params, layers included (#109)', () => {
      expect(buildUrl('orrery', someOn, at('orrery', 'layers=iss&focus=Mars&junk=1'))).toBe(
        '/orrery/#focus=Mars',
      )
    })

    it('writes a bare /orrery/ when arriving from another tab', () => {
      expect(buildUrl('orrery', someOn, at('earth', 'layers=iss&focus=Mars'))).toBe('/orrery/')
    })

    it('never carries orrery params to another tab', () => {
      expect(buildUrl('earth', someOn, link)).toBe('/#layers=iss,quakes')
      expect(buildUrl('sun', someOn, link)).toBe('/sun/')
    })
  })

  describe('keeps the sky view link (#99 item 5)', () => {
    const link = at('sky', 'target=sbc:20000004&t=2026-11-14T22:00:00Z')

    it('keeps a sky link as it is, encoding untouched', () => {
      expect(buildUrl('sky', someOn, link)).toBe('/sky/#target=sbc:20000004&t=2026-11-14T22:00:00Z')
    })

    it('drops anything but the sky params', () => {
      expect(buildUrl('sky', someOn, at('sky', 'layers=iss&target=sbc:20000004&junk=1'))).toBe(
        '/sky/#target=sbc:20000004',
      )
    })

    it('writes a bare /sky/ when arriving from another tab, and never carries its params away', () => {
      expect(buildUrl('sky', someOn, at('orrery', 'focus=Mars'))).toBe('/sky/')
      expect(buildUrl('orrery', someOn, link)).toBe('/orrery/')
      expect(buildUrl('earth', someOn, link)).toBe('/#layers=iss,quakes')
    })
  })
})

describe('useHashView switches the path (ADR 0036)', () => {
  afterEach(() => {
    cleanup()
    window.history.replaceState(null, '', '/')
    localStorage.clear()
  })

  it('pushes one history entry per view switch and follows back to the earlier view', () => {
    renderHook(() => {
      useHashView()
    })
    const start = window.history.length
    act(() => {
      useUiStore.getState().setView('sun')
    })
    expect(window.location.pathname).toBe('/sun/')
    expect(window.history.length).toBe(start + 1)
    act(() => {
      window.history.replaceState(null, '', '/orrery/#focus=Mars')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(useUiStore.getState().view).toBe('orrery')
    expect(window.location.pathname + window.location.hash).toBe('/orrery/#focus=Mars')
  })

  it('rewrites an old link to its path before it reads the state', () => {
    window.history.replaceState(null, '', '/#sky?target=sbc:20000004')
    renderHook(() => {
      useHashView()
    })
    expect(useUiStore.getState().view).toBe('sky')
    expect(window.location.pathname + window.location.hash).toBe('/sky/#target=sbc:20000004')
  })
})
