/**
 * Horizons VECTORS parsing (#93). Fixtures are real Horizons answers fetched one request
 * at a time on 2026-11-06 (heliocentric, ecliptic J2000, AU-D, VEC_TABLE 2, CSV) and
 * trimmed to the lines the parser reads.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  horizonsRows,
  parseEphemerisLimit,
  parseHorizons,
  parseHorizonsVectors,
  parseObservedUntil,
} from '@/lib/horizons'

const fixture = (name: string) =>
  readFileSync(join(__dirname, 'fixtures', 'horizons', `${name}.txt`), 'utf8')

describe('horizonsRows', () => {
  it('returns the trimmed data rows between $$SOE and $$EOE', () => {
    const rows = horizonsRows(fixture('wind'))
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatch(/^2461349\.5/)
  })

  it('returns [] when there is no data block', () => {
    expect(horizonsRows(fixture('soho-after'))).toEqual([])
  })

  it('still feeds the OBSERVER parser (#88 planets)', () => {
    const result = `x\n$$SOE\n 2026-Jun-18 00:00     03 18 14.81 +17 47 39.4    1.333   4.226   34.5789 /L\n$$EOE\n`
    expect(parseHorizons(result)?.elongation).toBeCloseTo(34.5789, 3)
  })
})

describe('parseHorizonsVectors', () => {
  it('reads Julian date, position (au) and velocity (au/day) from each CSV row', () => {
    const v = parseHorizonsVectors(fixture('voyager1'))
    expect(v).not.toBeNull()
    expect(v?.target).toBe('Voyager 1 (spacecraft) (-31)')
    expect(v?.samples).toHaveLength(5)
    const first = v?.samples[0]
    expect(first?.jd).toBe(2461349.5)
    // Voyager 1 is about 172 au out (Horizons, 2026-11-05).
    const r = Math.hypot(first?.x ?? 0, first?.y ?? 0, first?.z ?? 0)
    expect(r).toBeGreaterThan(170)
    expect(r).toBeLessThan(175)
    // About 3.6 au/yr outward: ~0.0098 au/day.
    expect(Math.hypot(first?.vx ?? 0, first?.vy ?? 0, first?.vz ?? 0)).toBeCloseTo(0.0098, 3)
  })

  it('returns null when Horizons sent no data block', () => {
    expect(parseHorizonsVectors(fixture('soho-after'))).toBeNull()
  })

  it('drops a malformed row rather than inventing numbers', () => {
    const text =
      '$$SOE\n2461349.5, A.D. x, 1, 2, 3, 4, 5, 6,\n2461350.5, A.D. y, 1, oops, 3, 4, 5, 6,\n$$EOE'
    expect(parseHorizonsVectors(text)?.samples).toHaveLength(1)
  })
})

describe('parseEphemerisLimit', () => {
  it('reads an "after" limit: the ephemeris ends there', () => {
    const limit = parseEphemerisLimit(fixture('soho-after'))
    expect(limit?.side).toBe('after')
    expect(limit?.iso).toBe('2026-12-14T23:51:09.183Z')
  })

  it('reads a "prior to" limit: the ephemeris starts there', () => {
    const limit = parseEphemerisLimit(fixture('voyager1-prior'))
    expect(limit?.side).toBe('prior')
    expect(limit?.iso).toBe('1977-09-05T13:59:24.383Z')
  })

  it('returns null for a normal answer', () => {
    expect(parseEphemerisLimit(fixture('earth'))).toBeNull()
  })
})

describe('parseObservedUntil', () => {
  const now = Date.UTC(2026, 10, 6)

  it('reads "tracking data through YYYY-Mon-DD"', () => {
    expect(parseObservedUntil(fixture('wind'), now)).toBe('2026-11-02')
  })

  it('reads "tracking data through Month D" with the year of the request', () => {
    expect(parseObservedUntil(fixture('jwst'), now)).toBe('2026-11-01')
  })

  it('puts a month-and-day in the past year when it would be in the future', () => {
    const text = 'based on tracking data through December 30, \n'
    expect(parseObservedUntil(text, now)).toBe('2025-12-30')
  })

  it("reads the Voyagers' final two-way tracking date", () => {
    expect(parseObservedUntil(fixture('voyager1'), now)).toBe('1992-04-24')
  })

  it('reads SOHO\'s last "(prediction > Mon DD)" trajectory segment', () => {
    expect(parseObservedUntil(fixture('soho-after'), now)).toBe('2026-10-05')
  })

  it('returns null when the header says nothing about tracking (planets)', () => {
    expect(parseObservedUntil(fixture('earth'), now)).toBeNull()
  })
})
