import { create } from 'zustand'

interface UiState {
  tickerPaused: boolean
  selectedEventId: string | null
  setTickerPaused: (paused: boolean) => void
  setSelectedEventId: (id: string | null) => void
}

export const useUiStore = create<UiState>((set) => ({
  tickerPaused: false,
  selectedEventId: null,
  setTickerPaused: (paused) => set({ tickerPaused: paused }),
  setSelectedEventId: (id) => set({ selectedEventId: id }),
}))
