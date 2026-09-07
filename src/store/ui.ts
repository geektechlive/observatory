import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'

import type { SourceName, SourceState } from '@/lib/health'

export type ConsoleView = 'earth' | 'sun' | 'sky' | 'orbit'

export const CONSOLE_VIEWS: ConsoleView[] = ['earth', 'sun', 'sky', 'orbit']

/** Globe vs flat map for the EARTH stage. */
export type MapMode = 'globe' | 'map'

export type LayerKey =
  | 'iss'
  | 'events'
  | 'quakes'
  | 'terminator'
  | 'fires'
  | 'disasters'
  | 'satellites'
  | 'fireballs'
  | 'launches'
  | 'gibs'
  | 'air'
  | 'nws'
  | 'aircraft'
  | 'buoys'
  | 'aurora'

// Curated-clean default: a tasteful subset on, everything else opt-in.
const DEFAULT_LAYERS: Record<LayerKey, boolean> = {
  iss: true,
  events: true,
  quakes: true,
  terminator: true,
  fires: false,
  disasters: false,
  satellites: false,
  fireballs: false,
  launches: false,
  gibs: false,
  air: false,
  nws: false,
  aircraft: false,
  buoys: false,
  aurora: false,
}

export const LAYER_KEYS = Object.keys(DEFAULT_LAYERS) as LayerKey[]

export function isLayerKey(value: string): value is LayerKey {
  return Object.prototype.hasOwnProperty.call(DEFAULT_LAYERS, value)
}

interface UiState {
  view: ConsoleView
  mapMode: MapMode
  layers: Record<LayerKey, boolean>
  tickerPaused: boolean
  selectedEventId: string | null
  quotaRemaining: number | null
  /** Legacy boolean error flags, keyed loosely. Superseded by `sourceHealth`. */
  sourceErrors: Record<string, boolean>
  /** Graded per-source health. Absent key means "not reported yet". */
  sourceHealth: Partial<Record<SourceName, SourceState>>
  setView: (view: ConsoleView) => void
  setMapMode: (mode: MapMode) => void
  toggleLayer: (key: LayerKey) => void
  setLayer: (key: LayerKey, on: boolean) => void
  setTickerPaused: (paused: boolean) => void
  setSelectedEventId: (id: string | null) => void
  setQuotaRemaining: (n: number | null) => void
  setSourceError: (key: string, hasError: boolean) => void
  setSourceHealth: (name: SourceName, state: SourceState) => void
}

/** Only the user's stage preferences survive a reload; live data never does. */
type PersistedUiState = Pick<UiState, 'layers' | 'mapMode'>

const PERSIST_KEY = 'observatory-ui'

/**
 * localStorage throws outright in some privacy modes and inside sandboxed
 * iframes, so every access is guarded; failing to persist must never take the
 * console down.
 */
const safeStorage: StateStorage = {
  getItem: (name) => {
    try {
      return globalThis.localStorage.getItem(name)
    } catch {
      return null
    }
  },
  setItem: (name, value) => {
    try {
      globalThis.localStorage.setItem(name, value)
    } catch {
      /* storage unavailable or full — preferences simply do not persist */
    }
  },
  removeItem: (name) => {
    try {
      globalThis.localStorage.removeItem(name)
    } catch {
      /* nothing to do */
    }
  },
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      view: 'earth',
      mapMode: 'globe',
      layers: DEFAULT_LAYERS,
      tickerPaused: false,
      selectedEventId: null,
      quotaRemaining: null,
      sourceErrors: {},
      sourceHealth: {},
      setView: (view) => set({ view }),
      setMapMode: (mapMode) => set({ mapMode }),
      toggleLayer: (key) =>
        set((state) => ({ layers: { ...state.layers, [key]: !state.layers[key] } })),
      setLayer: (key, on) => set((state) => ({ layers: { ...state.layers, [key]: on } })),
      setTickerPaused: (paused) => set({ tickerPaused: paused }),
      setSelectedEventId: (id) => set({ selectedEventId: id }),
      setQuotaRemaining: (n) => set({ quotaRemaining: n }),
      setSourceError: (key, hasError) =>
        set((state) => ({ sourceErrors: { ...state.sourceErrors, [key]: hasError } })),
      // Skips no-op writes: 30+ sources re-reporting 'ok' every poll would
      // otherwise hand every subscriber a fresh object on each tick.
      setSourceHealth: (name, state) => {
        if (get().sourceHealth[name] === state) return
        set((s) => ({ sourceHealth: { ...s.sourceHealth, [name]: state } }))
      },
    }),
    {
      name: PERSIST_KEY,
      storage: createJSONStorage(() => safeStorage),
      partialize: (state): PersistedUiState => ({
        layers: state.layers,
        mapMode: state.mapMode,
      }),
      // A blob written before a layer existed would leave that key undefined
      // while typed boolean, so persisted layers are merged over the defaults.
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<PersistedUiState>
        return {
          ...current,
          mapMode: saved.mapMode ?? current.mapMode,
          layers: { ...DEFAULT_LAYERS, ...(saved.layers ?? {}) },
        }
      },
    },
  ),
)
