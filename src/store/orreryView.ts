import { create } from 'zustand'

import { DEFAULT_PRESET } from '@/components/orrery/defaultView'
import type { FocusPreset, ScaleMode, SceneKey } from '@/components/orrery/three/OrreryRenderer'

/**
 * What the orrery page's controls say about the view (#189): the selected object, the
 * focus preset and the scale mode. The renderer outlives the page (OrreryPage `shared`),
 * so these outlive it too, like the clock (orreryClock.ts): coming back to the tab, the
 * chips, the inspector and the link describe the view still on screen. Never persisted: a
 * reload starts at the defaults, or at what its link asks for. Only the orrery chunk
 * imports this (type-only imports from the renderer).
 */
interface OrreryViewState {
  selected: SceneKey | null
  scale: ScaleMode
  preset: FocusPreset | null
  setSelected: (next: SceneKey | null | ((current: SceneKey | null) => SceneKey | null)) => void
  setScale: (scale: ScaleMode) => void
  setPreset: (preset: FocusPreset | null) => void
}

export const useOrreryView = create<OrreryViewState>((set) => ({
  selected: null,
  scale: 'exaggerated',
  preset: DEFAULT_PRESET,
  setSelected: (next) => {
    set((s) => ({ selected: typeof next === 'function' ? next(s.selected) : next }))
  },
  setScale: (scale) => {
    set({ scale })
  },
  setPreset: (preset) => {
    set({ preset })
  },
}))
