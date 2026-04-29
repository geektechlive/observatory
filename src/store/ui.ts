import { create } from 'zustand'

interface UiState {
  tickerPaused: boolean
  selectedEventId: string | null
  quotaRemaining: number | null
  isLive: boolean
  setTickerPaused: (paused: boolean) => void
  setSelectedEventId: (id: string | null) => void
  setQuotaRemaining: (n: number | null) => void
  setIsLive: (v: boolean) => void
}

export const useUiStore = create<UiState>((set) => ({
  tickerPaused: false,
  selectedEventId: null,
  quotaRemaining: null,
  isLive: true,
  setTickerPaused: (paused) => set({ tickerPaused: paused }),
  setSelectedEventId: (id) => set({ selectedEventId: id }),
  setQuotaRemaining: (n) => set({ quotaRemaining: n }),
  setIsLive: (v) => set({ isLive: v }),
}))
