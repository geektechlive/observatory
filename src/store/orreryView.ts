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
  /**
   * The "Look closer" model view is open on this object (#203), or null. Always the
   * selected object: choosing another, or deselecting, closes it. Written to the link as
   * `detail=1` (useOrreryLink); the view subscribes to this and renders nothing at null.
   */
  detail: SceneKey | null
  setSelected: (next: SceneKey | null | ((current: SceneKey | null) => SceneKey | null)) => void
  setScale: (scale: ScaleMode) => void
  setPreset: (preset: FocusPreset | null) => void
  /**
   * Opens the detail view on `key`. Invariant: the detail view is only ever open on the
   * selected object, so this does nothing unless `key` is already selected. It never
   * selects (the page's `select` also resets the preset, closes the sheet and switches a
   * satellite's group on); select first, then open.
   */
  openDetail: (key: SceneKey) => void
  closeDetail: () => void
}

export const useOrreryView = create<OrreryViewState>((set) => ({
  selected: null,
  scale: 'exaggerated',
  preset: DEFAULT_PRESET,
  detail: null,
  setSelected: (next) => {
    set((s) => {
      const selected = typeof next === 'function' ? next(s.selected) : next
      return { selected, detail: selected === s.detail ? s.detail : null }
    })
  },
  setScale: (scale) => {
    set({ scale })
  },
  setPreset: (preset) => {
    set({ preset })
  },
  openDetail: (key) => {
    set((s) => (s.selected === key ? { detail: key } : {}))
  },
  closeDetail: () => {
    set({ detail: null })
  },
}))
