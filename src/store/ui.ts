import { create } from 'zustand'

interface UiState {
  tickerPaused: boolean
  selectedEventId: string | null
  quotaRemaining: number | null
  sourceErrors: Record<string, boolean>
  setTickerPaused: (paused: boolean) => void
  setSelectedEventId: (id: string | null) => void
  setQuotaRemaining: (n: number | null) => void
  setSourceError: (key: string, hasError: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  tickerPaused: false,
  selectedEventId: null,
  quotaRemaining: null,
  sourceErrors: {},
  setTickerPaused: (paused) => set({ tickerPaused: paused }),
  setSelectedEventId: (id) => set({ selectedEventId: id }),
  setQuotaRemaining: (n) => set({ quotaRemaining: n }),
  setSourceError: (key, hasError) =>
    set((state) => ({ sourceErrors: { ...state.sourceErrors, [key]: hasError } })),
}))
