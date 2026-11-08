/**
 * The facts the guide states (#159), each checked against a primary source or against
 * arithmetic, so the copy cannot drift from them.
 */
import { describe, expect, it } from 'vitest'

import { jdFromDate } from '@/lib/orrery'
import { findRetrograde, geocentricLongitudeDeg } from '@/lib/orrery/retrograde'
import { AU_KM, C_KM_S } from '@/lib/orrery/units'

const jd = (y: number, m: number, d: number) => jdFromDate(new Date(Date.UTC(y, m - 1, d)))

describe('Mars retrograde loop of 2024-25 (guide lesson)', () => {
  // JPL Horizons, observer table from the geocentre (CENTER=500@399), queried 2026-11-07:
  // Mars's apparent ecliptic longitude peaks at 126.1711 deg on 2024-Dec-07 and bottoms
  // out at 107.0152 deg on 2025-Feb-24; the Sun-observer-target angle peaks at 175.71 deg
  // on 2025-Jan-16 (Mars is 4.3 deg north of the ecliptic, so it never reaches 180).
  const loop = findRetrograde('Mars', jd(2024, 10, 1), jd(2025, 5, 1))

  it('starts within three days of the date Horizons gives', () => {
    expect(loop).not.toBeNull()
    expect(Math.abs((loop?.startJd ?? 0) - jd(2024, 12, 7))).toBeLessThanOrEqual(3)
  })

  it('ends within three days of the date Horizons gives', () => {
    expect(Math.abs((loop?.endJd ?? 0) - jd(2025, 2, 24))).toBeLessThanOrEqual(3)
  })

  it('has opposition within two days of 2025-01-16', () => {
    expect(Math.abs((loop?.oppositionJd ?? 0) - jd(2025, 1, 16))).toBeLessThanOrEqual(2)
  })

  it('moves Mars about 19 degrees backwards, as Horizons shows', () => {
    const back =
      geocentricLongitudeDeg('Mars', loop?.startJd ?? 0) -
      geocentricLongitudeDeg('Mars', loop?.endJd ?? 0)
    // Horizons: 126.1711 - 107.0152 = 19.16 deg.
    expect(back).toBeGreaterThan(17)
    expect(back).toBeLessThan(21)
  })

  it('finds nothing where Mars only moves forward', () => {
    expect(findRetrograde('Mars', jd(2025, 4, 1), jd(2025, 8, 1))).toBeNull()
  })
})

describe('arithmetic the guide quotes', () => {
  it('light crosses one au in about 8 min 19 s', () => {
    const s = AU_KM / C_KM_S
    expect(Math.floor(s / 60)).toBe(8)
    expect(Math.round(s % 60)).toBe(19)
  })

  it('puts the geostationary ring 35,786 km up, 6.6 Earth radii from the centre', () => {
    // Kepler's third law: a = (GM T^2 / 4 pi^2)^(1/3). GM of Earth 398600.4418 km^3/s^2,
    // sidereal day 86164.0905 s, equatorial radius 6378.137 km (all IERS/WGS84 values).
    const a = Math.cbrt((398_600.4418 * 86_164.0905 ** 2) / (4 * Math.PI ** 2))
    expect(Math.round(a - 6378.137)).toBe(35_786)
    expect(a / 6371).toBeCloseTo(6.6, 1)
  })

  it('has the Moon about 60 Earth radii away', () => {
    expect(Math.round(384_400 / 6371)).toBe(60)
  })

  it('has solar wind at 400 km/s cross 1.5 million km in about an hour', () => {
    expect(1_500_000 / 400 / 3600).toBeCloseTo(1.04, 1)
  })
})
