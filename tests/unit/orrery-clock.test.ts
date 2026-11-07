/**
 * The orrery's simulation clock (#91, spec Part 7): an anchor (sim time, wall time) and a
 * rate, so the renderer can read the time each frame without a React render.
 */
import { afterEach, describe, expect, it } from 'vitest'

import {
  PLAYBACK_RATES,
  SIM_MAX_MS,
  SIM_MIN_MS,
  simAtEdge,
  simTimeAt,
  useOrreryClock,
} from '@/store/orreryClock'

const T0 = Date.parse('2026-11-06T00:00:00Z')
const DAY_S = 86_400

describe('playback rates (#114)', () => {
  it('goes past a day a second: a week, a month and a year a second', () => {
    expect(PLAYBACK_RATES).toEqual([1, 60, 3600, DAY_S, 7 * DAY_S, 30 * DAY_S, 365 * DAY_S])
  })
})

describe('the clock’s range (#114): JPL Table 2, 3000 BC to 3000 AD', () => {
  it('spans -2999-01-01 to the end of 3000', () => {
    expect(new Date(SIM_MIN_MS).getUTCFullYear()).toBe(-2999)
    expect(new Date(SIM_MAX_MS).getUTCFullYear()).toBe(3000)
    expect(new Date(SIM_MAX_MS + 1).getUTCFullYear()).toBe(3001)
  })

  it('never runs past either edge, however fast it plays', () => {
    const near = SIM_MAX_MS - 10 * DAY_S * 1000
    expect(
      simTimeAt({ anchorSim: near, anchorWall: 0, rate: 365 * DAY_S, playing: true }, 5000),
    ).toBe(SIM_MAX_MS)
    expect(
      simTimeAt(
        { anchorSim: SIM_MIN_MS + 1000, anchorWall: 0, rate: -365 * DAY_S, playing: true },
        5000,
      ),
    ).toBe(SIM_MIN_MS)
  })

  it('says when the clock sits on an edge', () => {
    expect(simAtEdge(SIM_MAX_MS)).toBe(true)
    expect(simAtEdge(SIM_MIN_MS)).toBe(true)
    expect(simAtEdge(T0)).toBe(false)
  })

  it('clamps a set time to the range', () => {
    useOrreryClock.getState().setSimTime(SIM_MAX_MS + 1e12, 0)
    expect(useOrreryClock.getState().anchorSim).toBe(SIM_MAX_MS)
    useOrreryClock.getState().resetToNow(Date.now())
  })
})

describe('simTimeAt (#91)', () => {
  it('holds still while paused', () => {
    expect(simTimeAt({ anchorSim: T0, anchorWall: 1000, rate: 3600, playing: false }, 5000)).toBe(
      T0,
    )
  })

  it('never reads a moment before the anchor', () => {
    expect(simTimeAt({ anchorSim: T0, anchorWall: 2000, rate: 60, playing: true }, 1990)).toBe(T0)
  })

  it('runs at the rate while playing', () => {
    expect(simTimeAt({ anchorSim: T0, anchorWall: 1000, rate: 60, playing: true }, 2000)).toBe(
      T0 + 60_000,
    )
  })
})

describe('useOrreryClock (#91)', () => {
  afterEach(() => {
    useOrreryClock.getState().resetToNow(Date.now())
  })

  it('re-anchors on a rate change so the sim time does not jump', () => {
    const clock = useOrreryClock.getState()
    clock.setSimTime(T0, 0)
    clock.play(0)
    useOrreryClock.getState().setRate(86_400, 0)
    useOrreryClock.getState().setRate(60, 1000)
    const s = useOrreryClock.getState()
    // 1 s of wall time at 86400x = one day, then the anchor moves there.
    expect(s.anchorSim).toBe(T0 + 86_400_000)
    expect(simTimeAt(s, 2000)).toBe(T0 + 86_400_000 + 60_000)
  })

  it('steps by days while paused, and resets to now', () => {
    const clock = useOrreryClock.getState()
    clock.setSimTime(T0, 0)
    clock.step(-7 * 86_400_000, 0)
    expect(useOrreryClock.getState().anchorSim).toBe(T0 - 7 * 86_400_000)
    useOrreryClock.getState().resetToNow(T0 + 5)
    const s = useOrreryClock.getState()
    expect(s.anchorSim).toBe(T0 + 5)
    expect(s.rate).toBe(1)
    expect(s.playing).toBe(true)
  })
})
