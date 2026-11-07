import { describe, expect, it } from 'vitest'

import {
  clockIsLive,
  parseOrreryLink,
  resolveFocus,
  serialiseOrreryLink,
} from '@/components/orrery/orreryLink'
import { SIM_MAX_MS, SIM_MIN_MS } from '@/store/orreryClock'

const V1_HELIOPAUSE = Date.UTC(2012, 7, 25)

describe('parseOrreryLink (#108)', () => {
  it('reads time, focus and preset', () => {
    expect(
      parseOrreryLink('#orrery?t=2012-08-25T00:00:00Z&focus=naif:-31&preset=heliosphere'),
    ).toEqual({ t: V1_HELIOPAUSE, focus: 'naif:-31', preset: 'heliosphere' })
  })

  it('takes a bare date as midnight UTC', () => {
    expect(parseOrreryLink('#orrery?t=2012-08-25').t).toBe(V1_HELIOPAUSE)
  })

  it('decodes an encoded focus (an asteroid designation has a space)', () => {
    expect(parseOrreryLink('#orrery?focus=sb:2001%20KF54').focus).toBe('sb:2001 KF54')
    expect(parseOrreryLink('#orrery?focus=Voyager+1').focus).toBe('Voyager 1')
  })

  it('reads nothing from a bare #orrery or another tab', () => {
    const none = { t: null, focus: null, preset: null }
    expect(parseOrreryLink('#orrery')).toEqual(none)
    expect(parseOrreryLink('')).toEqual(none)
    expect(parseOrreryLink('#earth?t=2012-08-25&focus=Mars')).toEqual(none)
  })

  it('ignores a time it cannot read', () => {
    expect(parseOrreryLink('#orrery?t=yesterday').t).toBeNull()
    expect(parseOrreryLink('#orrery?t=').t).toBeNull()
    expect(parseOrreryLink('#orrery?t=12345').t).toBeNull()
  })

  it('clamps a time to the planet tables (3000 BC to 3000 AD)', () => {
    expect(parseOrreryLink('#orrery?t=+009000-01-01T00:00:00Z').t).toBe(SIM_MAX_MS)
    expect(parseOrreryLink('#orrery?t=-009000-01-01T00:00:00Z').t).toBe(SIM_MIN_MS)
  })

  it('ignores an unknown preset', () => {
    expect(parseOrreryLink('#orrery?preset=andromeda').preset).toBeNull()
    expect(parseOrreryLink('#orrery?preset=earth').preset).toBe('earth')
    expect(parseOrreryLink('#orrery?preset=orbit').preset).toBe('orbit')
  })

  it('ignores an empty or oversized focus', () => {
    expect(parseOrreryLink('#orrery?focus=').focus).toBeNull()
    expect(parseOrreryLink(`#orrery?focus=${'x'.repeat(200)}`).focus).toBeNull()
  })

  it('survives a malformed escape', () => {
    expect(parseOrreryLink('#orrery?focus=%E0%A4%A&t=2012-08-25').t).toBe(V1_HELIOPAUSE)
  })
})

describe('serialiseOrreryLink (#108)', () => {
  it('writes time, focus and preset in a fixed order', () => {
    expect(serialiseOrreryLink({ t: V1_HELIOPAUSE, focus: 'naif:-31', preset: null })).toBe(
      '#orrery?t=2012-08-25T00:00:00Z&focus=naif:-31',
    )
  })

  it('writes a bare #orrery when there is nothing to say', () => {
    expect(serialiseOrreryLink({ t: null, focus: null, preset: null })).toBe('#orrery')
  })

  it('keeps the colon readable and encodes the rest', () => {
    expect(serialiseOrreryLink({ t: null, focus: 'sb:2001 KF54', preset: null })).toBe(
      '#orrery?focus=sb:2001%20KF54',
    )
  })

  it('round-trips through the parser, dates BC included', () => {
    const cases = [
      { t: V1_HELIOPAUSE + 12_345_000, focus: 'naif:-31', preset: null },
      { t: SIM_MIN_MS, focus: null, preset: 'outer' as const },
      { t: null, focus: 'sb:2026 VP1', preset: null },
      { t: null, focus: null, preset: 'earth' as const },
    ]
    for (const c of cases) expect(parseOrreryLink(serialiseOrreryLink(c))).toEqual(c)
  })

  it('writes whole seconds', () => {
    expect(serialiseOrreryLink({ t: V1_HELIOPAUSE + 999, focus: null, preset: null })).toBe(
      '#orrery?t=2012-08-25T00:00:00Z',
    )
  })
})

describe('resolveFocus (#108)', () => {
  const items = [
    { key: 'Mars', label: 'Mars' },
    { key: 'naif:-31', label: 'Voyager 1' },
    { key: 'naif:501', label: 'Io' },
    { key: 'sb:524522', label: 'Zoozve' },
  ]

  it('matches a key first', () => {
    expect(resolveFocus('naif:-31', items)).toBe('naif:-31')
  })

  it('then a name, ignoring case, with - or _ for spaces', () => {
    expect(resolveFocus('Voyager 1', items)).toBe('naif:-31')
    expect(resolveFocus('voyager-1', items)).toBe('naif:-31')
    expect(resolveFocus('ZOOZVE', items)).toBe('sb:524522')
    expect(resolveFocus('mars', items)).toBe('Mars')
  })

  it('finds nothing for an unknown name', () => {
    expect(resolveFocus('Pluto', items)).toBeNull()
  })
})

describe('clockIsLive (#108)', () => {
  const now = Date.UTC(2026, 10, 7, 12)
  const live = { anchorSim: now, anchorWall: now, rate: 1, playing: true }

  it('is live when running at 1x on the wall clock', () => {
    expect(clockIsLive(live, now + 5_000)).toBe(true)
  })

  it('is not live when paused, fast, or away from now', () => {
    expect(clockIsLive({ ...live, playing: false }, now)).toBe(false)
    expect(clockIsLive({ ...live, rate: 3600 }, now + 5_000)).toBe(false)
    expect(clockIsLive({ ...live, anchorSim: V1_HELIOPAUSE }, now)).toBe(false)
  })
})
