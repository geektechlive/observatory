/**
 * "Tonight, from here" (#78): sun and moon altitude for the user's location, hour by
 * hour. Reference altitudes are USNO's (aa.usno.navy.mil/api/celnav, geocentric Hc),
 * fetched 2026-10-27.
 */
import { describe, expect, it } from 'vitest'

import { darkness, darkWindow, moonAltitude, sunAltitude, tonightStrip } from '@/lib/tonight'

const KC = { lat: 39.1, lon: -94.6 }
const GREENWICH = { lat: 51.48, lon: 0 }
const TROMSO = { lat: 69.65, lon: 18.96 }
const at = (iso: string) => new Date(iso)

describe('sunAltitude', () => {
  it.each([
    ['2026-10-27T18:00:00Z', KC, 37.934],
    ['2026-10-28T09:00:00Z', GREENWICH, 16.243],
    ['2026-06-21T23:00:00Z', TROMSO, 3.12],
  ])('%s matches USNO within 0.5°', (iso, place, usno) => {
    expect(sunAltitude(at(iso), place.lat, place.lon)).toBeCloseTo(usno, 0)
    expect(Math.abs(sunAltitude(at(iso), place.lat, place.lon) - usno)).toBeLessThan(0.5)
  })

  it('is near the zenith at the equator at an equinox noon', () => {
    expect(sunAltitude(at('2026-03-20T12:07:00Z'), 0, 0)).toBeGreaterThan(88)
  })
})

describe('moonAltitude', () => {
  it.each([
    ['2026-10-27T03:00:00Z', KC, 38.909],
    ['2026-10-28T09:00:00Z', GREENWICH, 8.841],
  ])('%s matches USNO within 1°', (iso, place, usno) => {
    expect(Math.abs(moonAltitude(at(iso), place.lat, place.lon) - usno)).toBeLessThan(1)
  })
})

describe('darkness', () => {
  it.each([
    [10, 'day'],
    [-0.5, 'day'],
    [-3, 'civil'],
    [-8, 'nautical'],
    [-15, 'astronomical'],
    [-20, 'dark'],
  ] as const)('sun at %s° is %s', (alt, level) => {
    expect(darkness(alt)).toBe(level)
  })
})

describe('darkWindow', () => {
  it('finds the next fully dark period, to within 5 minutes', () => {
    const w = darkWindow(at('2026-10-27T18:00:00Z'), KC.lat, KC.lon)
    expect(w).not.toBeNull()
    if (!w) return
    expect(w.start.getTime()).toBeGreaterThan(at('2026-10-27T18:00:00Z').getTime())
    expect(sunAltitude(w.start, KC.lat, KC.lon)).toBeCloseTo(-18, 0)
    expect(sunAltitude(w.end, KC.lat, KC.lon)).toBeCloseTo(-18, 0)
    expect(w.end.getTime()).toBeGreaterThan(w.start.getTime())
  })

  it('starts now when it is already dark', () => {
    const now = at('2026-10-28T05:00:00Z')
    expect(darkWindow(now, KC.lat, KC.lon)?.start).toEqual(now)
  })

  it('is null where the night never gets fully dark', () => {
    expect(darkWindow(at('2026-06-21T12:00:00Z'), TROMSO.lat, TROMSO.lon)).toBeNull()
  })
})

describe('tonightStrip', () => {
  it('gives twelve hourly slots from the current hour, with sun, moon and darkness', () => {
    const strip = tonightStrip(at('2026-10-27T22:40:00Z'), KC.lat, KC.lon)
    expect(strip).toHaveLength(12)
    expect(strip[0]?.time.toISOString()).toBe('2026-10-27T22:00:00.000Z')
    expect(strip[11]?.time.toISOString()).toBe('2026-10-28T09:00:00.000Z')
    for (const slot of strip) {
      expect(slot.darkness).toBe(darkness(slot.sunAlt))
      expect(slot.moonUp).toBe(slot.moonAlt > 0)
    }
    // 05:00 UTC is local midnight in Kansas City in late October: fully dark.
    expect(strip.find((s) => s.time.getUTCHours() === 5)?.darkness).toBe('dark')
  })

  it('never reaches full dark at Tromsø in midsummer', () => {
    const strip = tonightStrip(at('2026-06-21T18:00:00Z'), TROMSO.lat, TROMSO.lon)
    expect(strip.some((s) => s.darkness === 'dark')).toBe(false)
  })
})
