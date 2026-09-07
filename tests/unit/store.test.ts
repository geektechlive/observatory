import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { isLayerKey, LAYER_KEYS, useUiStore } from '@/store/ui'

const PERSIST_KEY = 'observatory-ui'

const INITIAL = useUiStore.getState()

/**
 * This jsdom environment ships no localStorage at all (Node logs
 * "localStorage is not available"), which is itself the case `safeStorage`
 * guards against. Persistence is exercised against an in-memory stand-in.
 */
function memoryStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    clear: () => {
      map.clear()
    },
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => {
      map.delete(k)
    },
    setItem: (k: string, v: string) => {
      map.set(k, v)
    },
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
  useUiStore.setState(
    {
      view: INITIAL.view,
      mapMode: INITIAL.mapMode,
      layers: INITIAL.layers,
      tickerPaused: false,
      selectedEventId: null,
      quotaRemaining: null,
      sourceErrors: {},
      sourceHealth: {},
    },
    false,
  )
})

function persisted(): Record<string, unknown> {
  const raw = globalThis.localStorage.getItem(PERSIST_KEY)
  if (raw === null) return {}
  const parsed = JSON.parse(raw) as { state?: Record<string, unknown> }
  return parsed.state ?? {}
}

describe('layer helpers', () => {
  it('recognizes only real layer keys', () => {
    expect(isLayerKey('iss')).toBe(true)
    expect(isLayerKey('not-a-layer')).toBe(false)
    expect(isLayerKey('toString')).toBe(false)
  })

  it('exposes every layer key', () => {
    expect(LAYER_KEYS).toContain('iss')
    expect(LAYER_KEYS).toContain('aurora')
    expect(new Set(LAYER_KEYS).size).toBe(LAYER_KEYS.length)
  })
})

describe('immutability', () => {
  it('toggleLayer produces a new layers object and leaves the old one untouched', () => {
    const before = useUiStore.getState().layers
    useUiStore.getState().toggleLayer('fires')
    const after = useUiStore.getState().layers
    expect(after).not.toBe(before)
    expect(before.fires).toBe(false)
    expect(after.fires).toBe(true)
  })

  it('setLayer produces a new layers object', () => {
    const before = useUiStore.getState().layers
    useUiStore.getState().setLayer('gibs', true)
    expect(useUiStore.getState().layers).not.toBe(before)
    expect(before.gibs).toBe(false)
  })

  it('setSourceError produces a new sourceErrors object', () => {
    const before = useUiStore.getState().sourceErrors
    useUiStore.getState().setSourceError('neo', true)
    const after = useUiStore.getState().sourceErrors
    expect(after).not.toBe(before)
    expect(before['neo']).toBeUndefined()
    expect(after['neo']).toBe(true)
  })

  it('setSourceHealth produces a new sourceHealth object', () => {
    const before = useUiStore.getState().sourceHealth
    useUiStore.getState().setSourceHealth('neo', 'ok')
    const after = useUiStore.getState().sourceHealth
    expect(after).not.toBe(before)
    expect(before['neo']).toBeUndefined()
    expect(after['neo']).toBe('ok')
  })

  it('setSourceHealth skips a write when the state is unchanged', () => {
    useUiStore.getState().setSourceHealth('neo', 'ok')
    const first = useUiStore.getState().sourceHealth
    useUiStore.getState().setSourceHealth('neo', 'ok')
    expect(useUiStore.getState().sourceHealth).toBe(first)

    useUiStore.getState().setSourceHealth('neo', 'degraded')
    expect(useUiStore.getState().sourceHealth).not.toBe(first)
  })
})

describe('persistence', () => {
  it('persists only layers and mapMode', () => {
    useUiStore.getState().setLayer('fires', true)
    useUiStore.getState().setView('sun')
    useUiStore.getState().setSourceHealth('neo', 'error')
    useUiStore.getState().setQuotaRemaining(17)

    expect(Object.keys(persisted()).sort()).toEqual(['layers', 'mapMode'])
  })

  it('records layer and map mode changes', () => {
    useUiStore.getState().setLayer('aurora', true)
    useUiStore.getState().setMapMode('map')
    const state = persisted()
    expect(state['mapMode']).toBe('map')
    expect((state['layers'] as Record<string, boolean>)['aurora']).toBe(true)
  })

  it('merges a stale persisted blob over the current layer defaults', () => {
    const merge = useUiStore.persist.getOptions().merge
    expect(merge).toBeDefined()
    const merged = merge?.(
      { layers: { iss: false }, mapMode: 'map' },
      useUiStore.getState(),
    ) as ReturnType<typeof useUiStore.getState>

    expect(merged.layers.iss).toBe(false)
    // A layer absent from the saved blob falls back to its default, not undefined.
    expect(merged.layers.aurora).toBe(false)
    expect(Object.keys(merged.layers).sort()).toEqual([...LAYER_KEYS].sort())
    expect(merged.mapMode).toBe('map')
  })

  it('keeps the current map mode when the persisted blob has none', () => {
    const merge = useUiStore.persist.getOptions().merge
    const merged = merge?.({ layers: {} }, useUiStore.getState()) as ReturnType<
      typeof useUiStore.getState
    >
    expect(merged.mapMode).toBe('globe')
  })
})

describe('unavailable storage', () => {
  afterEach(() => {
    vi.resetModules()
  })

  it('does not throw when localStorage is missing entirely', () => {
    vi.stubGlobal('localStorage', undefined)
    expect(() => {
      useUiStore.getState().setLayer('nws', true)
    }).not.toThrow()
    expect(useUiStore.getState().layers.nws).toBe(true)
  })

  it('still builds a working store when localStorage throws', async () => {
    const thrower = () => {
      throw new Error('SecurityError: storage is disabled')
    }
    vi.stubGlobal('localStorage', {
      getItem: thrower,
      setItem: thrower,
      removeItem: thrower,
      clear: thrower,
      key: thrower,
      length: 0,
    })

    vi.resetModules()
    const mod = await import('@/store/ui')

    expect(mod.useUiStore.getState().layers.iss).toBe(true)
    expect(() => {
      mod.useUiStore.getState().setLayer('fires', true)
    }).not.toThrow()
    expect(mod.useUiStore.getState().layers.fires).toBe(true)
  })
})
