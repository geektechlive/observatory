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

const DAY_S = 86_400
/**
 * Sim seconds per wall second: real time up to a year a second (#114: at a day a second
 * Neptune moves about 0.006° a second, and the outer views looked frozen).
 */
export const PLAYBACK_RATES = [1, 60, 3600, DAY_S, 7 * DAY_S, 30 * DAY_S, 365 * DAY_S] as const

function utcMs(year: number, month: number, day: number, h = 0, m = 0, s = 0, ms = 0): number {
  const d = new Date(0)
  d.setUTCFullYear(year, month, day)
  d.setUTCHours(h, m, s, ms)
  return d.getTime()
}

/**
 * The clock's range: JPL Table 2's window, 3000 BC (astronomical -2999) to the end of
 * 3000 AD, as the date field accepts (simDate.ts MIN_YEAR / MAX_YEAR). Past it there are
 * no valid planet elements, so the clock stops at the edge (#114).
 */
export const SIM_MIN_MS = utcMs(-2999, 0, 1)
export const SIM_MAX_MS = utcMs(3000, 11, 31, 23, 59, 59, 999)

const clampSim = (ms: number) => Math.min(SIM_MAX_MS, Math.max(SIM_MIN_MS, ms))

/** The clock sits on an edge of its range. */
export function simAtEdge(ms: number): boolean {
  return ms <= SIM_MIN_MS || ms >= SIM_MAX_MS
}

/**
 * The simulated time at a wall-clock moment, inside the clock's range. A wall time read
 * just before the anchor was set counts as the anchor itself, so a readout never shows a
 * moment before a jump.
 */
export function simTimeAt(c: ClockAnchor, wallNow: number): number {
  return clampSim(
    c.playing ? c.anchorSim + Math.max(0, wallNow - c.anchorWall) * c.rate : c.anchorSim,
  )
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
      set({ anchorSim: clampSim(simMs), anchorWall: wallNow })
    },
    step: (deltaMs, wallNow = Date.now()) => {
      const s = get()
      set({ anchorSim: clampSim(simTimeAt(s, wallNow) + deltaMs), anchorWall: wallNow })
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
