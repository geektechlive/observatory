/**
 * Visible ISS passes (#81). Reference: Heavens-Above's pass list for 39.1°N 94.6°W
 * (heavens-above.com PassSummary, fetched 2026-10-28), computed from the same day's
 * TLE, which is the fixture below. Heavens-Above times are UTC.
 */
import { describe, expect, it } from 'vitest'

import { tleEpoch, visiblePasses } from '@/lib/orbit/passes'

const TLE = {
  line1: '1 25544U 98067A   26300.17675415  .00005704  00000+0  11132-3 0  9993',
  line2: '2 25544  51.6336   6.9404 0006948 314.9066  45.1358 15.49073103592213',
}
const KC = { lat: 39.1, lon: -94.6 }
const MINUTE = 60_000

const near = (actual: Date | undefined, iso: string) =>
  Math.abs((actual?.getTime() ?? 0) - Date.parse(iso)) <= MINUTE

describe('visiblePasses', () => {
  const passes = visiblePasses(TLE, KC.lat, KC.lon, new Date('2026-10-28T00:00:00Z'), 48)

  it('finds the 28 Oct morning pass Heavens-Above lists, to the minute', () => {
    const p = passes[0]
    expect(near(p?.start, '2026-10-28T11:38:38Z')).toBe(true)
    expect(near(p?.peak, '2026-10-28T11:41:07Z')).toBe(true)
    expect(near(p?.end, '2026-10-28T11:43:35Z')).toBe(true)
    expect(p?.maxElevation).toBeCloseTo(19, -0.5)
  })

  it('starts the 29 Oct pass where the ISS leaves Earth’s shadow, high in the sky', () => {
    const p = passes[1]
    expect(near(p?.start, '2026-10-29T10:52:52Z')).toBe(true)
    expect(near(p?.end, '2026-10-29T10:55:21Z')).toBe(true)
    expect(Math.abs((p?.startElevation ?? 0) - 14)).toBeLessThan(1.5)
  })

  it('rejects the passes in between: in daylight, or with the ISS in shadow', () => {
    expect(passes).toHaveLength(2)
    expect(visiblePasses(TLE, KC.lat, KC.lon, new Date('2026-10-28T12:00:00Z'), 22)).toEqual([])
  })

  it('gives compass directions for where to look', () => {
    expect(passes[0]?.from).toBe('NNW')
    expect(passes[0]?.to).toBe('ENE')
  })
})

describe('tleEpoch', () => {
  it('reads the epoch: 2026, day 300.17675415 is 27 Oct 04:14:31 UTC', () => {
    expect(tleEpoch(TLE.line1).toISOString()).toBe('2026-10-27T04:14:31.559Z')
  })
})
