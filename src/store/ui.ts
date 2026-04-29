import { create } from 'zustand'

interface UiState {
  tickerPaused: boolean
  selectedEventId: string | null
  quotaRemaining: number | null
  setTickerPaused: (paused: boolean) => void
  setSelectedEventId: (id: string | null) => void
  setQuotaRemaining: (n: number | null) => void
}

export const useUiStore = create<UiState>((set) => ({
  tickerPaused: false,
  selectedEventId: null,
  quotaRemaining: null,
  setTickerPaused: (paused) => set({ tickerPaused: paused }),
  setSelectedEventId: (id) => set({ selectedEventId: id }),
  setQuotaRemaining: (n) => set({ quotaRemaining: n }),
}))
