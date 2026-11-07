import { create } from 'zustand'

/**
 * The orrery's simulation clock (#91, spec Part 7). An anchor (sim time at a wall time)
 * plus a rate: the renderer reads `getState()` and computes the time each frame, so
 * nothing re-renders per frame. Never persisted: a reload starts at now.
 */
export interface ClockAnchor {
  /** Simulated epoch ms at `anchorWall`. */
  anchorSim: number
  /** Wall-clock ms (Date.now) when the anchor was set. */
  anchorWall: number
  /** Simulated seconds per wall second. */
  rate: number
  playing: boolean
}

export const PLAYBACK_RATES = [1, 60, 3600, 86_400] as const

/**
 * The simulated time at a wall-clock moment. A wall time read just before the anchor was
 * set counts as the anchor itself, so a readout never shows a moment before a jump.
 */
export function simTimeAt(c: ClockAnchor, wallNow: number): number {
  return c.playing ? c.anchorSim + Math.max(0, wallNow - c.anchorWall) * c.rate : c.anchorSim
}

interface ClockState extends ClockAnchor {
  setSimTime: (simMs: number, wallNow?: number) => void
  step: (deltaMs: number, wallNow?: number) => void
  setRate: (rate: number, wallNow?: number) => void
  play: (wallNow?: number) => void
  pause: (wallNow?: number) => void
  resetToNow: (wallNow?: number) => void
}

export const useOrreryClock = create<ClockState>()((set, get) => {
  // Every change re-anchors at the current sim time, so the clock never jumps.
  const reanchor = (wallNow: number, patch: Partial<ClockAnchor>) => {
    const s = get()
    set({ anchorSim: simTimeAt(s, wallNow), anchorWall: wallNow, ...patch })
  }
  const start = Date.now()
  return {
    anchorSim: start,
    anchorWall: start,
    rate: 1,
    playing: true,
    setSimTime: (simMs, wallNow = Date.now()) => {
      set({ anchorSim: simMs, anchorWall: wallNow })
    },
    step: (deltaMs, wallNow = Date.now()) => {
      const s = get()
      set({ anchorSim: simTimeAt(s, wallNow) + deltaMs, anchorWall: wallNow })
    },
    setRate: (rate, wallNow = Date.now()) => {
      reanchor(wallNow, { rate })
    },
    play: (wallNow = Date.now()) => {
      reanchor(wallNow, { playing: true })
    },
    pause: (wallNow = Date.now()) => {
      reanchor(wallNow, { playing: false })
    },
    resetToNow: (wallNow = Date.now()) => {
      set({ anchorSim: wallNow, anchorWall: wallNow, rate: 1, playing: true })
    },
  }
})
