/**
 * Units, light time, 3D placement and range rate for the orrery (#91), with the spec's
 * Part 17 constants: 1 au = 149,597,870.7 km, 1 km = 0.6213711922 mi, light time =
 * distance / c.
 */
import { describe, expect, it } from 'vitest'

import {
  AU_KM,
  C_KM_S,
  formatLightTime,
  heliocentric,
  jdFromDate,
  KM_TO_MI,
  LD_KM,
  lightTimeSeconds,
  place3d,
  rangeRateKmS,
} from '@/lib/orrery'

describe('constants (spec Part 6, 17)', () => {
  it('uses the IAU au, the nominal lunar distance, c and the statute mile', () => {
    expect(AU_KM).toBe(149_597_870.7)
    expect(LD_KM).toBe(384_400)
    expect(C_KM_S).toBe(299_792.458)
    expect(KM_TO_MI).toBe(0.6213711922)
  })

  it('light time is distance over c: 1 au is about 499 s', () => {
    expect(lightTimeSeconds(AU_KM)).toBeCloseTo(499.004784, 5)
    expect(formatLightTime(lightTimeSeconds(AU_KM))).toBe('8 min 19 s')
    expect(formatLightTime(30)).toBe('30 s')
    expect(formatLightTime(4.2 * 3600)).toBe('4 h 12 min')
  })
})

describe('place3d (#91): log-radial, direction kept', () => {
  it('maps the Sun to the origin', () => {
    expect(place3d({ x: 0, y: 0, z: 0 })).toEqual({ x: 0, y: 0, z: 0 })
  })

  it('keeps direction and grows with distance, compressing the outer system', () => {
    const one = place3d({ x: 1, y: 0, z: 0 })
    const thirty = place3d({ x: 0, y: 30, z: 0 })
    expect(one.y).toBe(0)
    expect(one.x).toBeGreaterThan(0)
    // Ecliptic +y is scene −z (three.js is y-up, right-handed).
    expect(thirty.x).toBeCloseTo(0, 9)
    expect(-thirty.z).toBeGreaterThan(one.x)
    // 30x the distance, but far less than 30x the radius on screen (8.3x with the bend
    // at 3 au, chosen for the Inner view; see orrery-framing.test.ts).
    expect(-thirty.z / one.x).toBeLessThan(10)
  })

  it('reaches Voyager 1 (172 au) inside a 200 au heliosphere frame', () => {
    const v = place3d({ x: 172, y: 0, z: 0 })
    const edge = place3d({ x: 200, y: 0, z: 0 })
    expect(v.x).toBeLessThan(edge.x)
  })

  it('swaps ecliptic z into scene y (three.js is y-up)', () => {
    const p = place3d({ x: 0, y: 0, z: 1 })
    expect(p.y).toBeGreaterThan(0)
    expect(p.x).toBe(0)
    expect(p.z).toBeCloseTo(0, 9)
  })
})

describe('rangeRateKmS (#91)', () => {
  const jd = jdFromDate(new Date('2026-11-06T00:00:00Z'))

  it('is negative while the gap is shrinking and positive while it grows', () => {
    const toward = rangeRateKmS(
      (t) => ({ x: 10 - (t - jd), y: 0, z: 0 }),
      () => ({ x: 0, y: 0, z: 0 }),
      jd,
    )
    expect(toward).toBeLessThan(0)
    expect(toward).toBeCloseTo(-AU_KM / 86_400, 3)
    const away = rangeRateKmS(
      (t) => ({ x: 10 + (t - jd), y: 0, z: 0 }),
      () => ({ x: 0, y: 0, z: 0 }),
      jd,
    )
    expect(away).toBeGreaterThan(0)
  })

  it('gives Mars a plausible rate relative to Earth (under 30 km/s)', () => {
    const r = rangeRateKmS(
      (t) => heliocentric('Mars', t),
      (t) => heliocentric('Earth', t),
      jd,
    )
    expect(Math.abs(r)).toBeLessThan(30)
  })
})
