import { create } from 'zustand'

export type ConsoleView = 'earth' | 'sun' | 'sky' | 'orbit'

export const CONSOLE_VIEWS: ConsoleView[] = ['earth', 'sun', 'sky', 'orbit']

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
}

interface UiState {
  view: ConsoleView
  layers: Record<LayerKey, boolean>
  tickerPaused: boolean
  selectedEventId: string | null
  quotaRemaining: number | null
  sourceErrors: Record<string, boolean>
  setView: (view: ConsoleView) => void
  toggleLayer: (key: LayerKey) => void
  setLayer: (key: LayerKey, on: boolean) => void
  setTickerPaused: (paused: boolean) => void
  setSelectedEventId: (id: string | null) => void
  setQuotaRemaining: (n: number | null) => void
  setSourceError: (key: string, hasError: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  view: 'earth',
  layers: DEFAULT_LAYERS,
  tickerPaused: false,
  selectedEventId: null,
  quotaRemaining: null,
  sourceErrors: {},
  setView: (view) => set({ view }),
  toggleLayer: (key) =>
    set((state) => ({ layers: { ...state.layers, [key]: !state.layers[key] } })),
  setLayer: (key, on) => set((state) => ({ layers: { ...state.layers, [key]: on } })),
  setTickerPaused: (paused) => set({ tickerPaused: paused }),
  setSelectedEventId: (id) => set({ selectedEventId: id }),
  setQuotaRemaining: (n) => set({ quotaRemaining: n }),
  setSourceError: (key, hasError) =>
    set((state) => ({ sourceErrors: { ...state.sourceErrors, [key]: hasError } })),
}))
