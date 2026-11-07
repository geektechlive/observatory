/**
 * JPL's Table 2 (#91): the long-window elements, 3000 BC to 3000 AD, with the extra
 * b, c, s, f terms in Jupiter–Neptune's mean anomaly. Checked against Horizons at two
 * dates outside Table 1's 1800–2050 window, within three times JPL's stated error for
 * the long window ("Approximate Positions of the Planets", accuracy table).
 *
 * The outer planets are checked against their system barycentres (Horizons 5–8, relative
 * to the solar-system barycentre): Table 2, like Table 1 (#90), tracks those, and the
 * planets' own ephemerides (599, 699, …) do not reach 1650 or 2600.
 */
import { describe, expect, it } from 'vitest'

import { heliocentric, jdFromDate, type PlanetName, PLANETS } from '@/lib/orrery'

import FIXTURE from './fixtures/horizons-helio-t2.json'

const AU_KM = 149_597_870.7
const ARCSEC = 3600

/** JPL's 3000 BC – 3000 AD table: [longitude arcsec, distance 1000 km]. */
const JPL_ERROR_T2: Record<PlanetName, [number, number]> = {
  Mercury: [20, 1],
  Venus: [40, 8],
  Earth: [40, 15],
  Mars: [100, 30],
  Jupiter: [600, 1000],
  Saturn: [1000, 4000],
  Uranus: [2000, 8000],
  Neptune: [400, 4000],
}
const ALLOWANCE = 3
const OUTER = new Set<PlanetName>(['Jupiter', 'Saturn', 'Uranus', 'Neptune'])

type Vec = { x: number; y: number; z: number }
const lon = (v: Vec) => Math.atan2(v.y, v.x) * (180 / Math.PI)
const dist = (v: Vec) => Math.hypot(v.x, v.y, v.z)
const angleDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)

const frames = FIXTURE as unknown as {
  heliocentric: Record<string, (Vec & { jd: number })[]>
  barycentric: Record<string, (Vec & { jd: number })[]>
}

describe('heliocentric with Table 2 (#91) against JPL Horizons', () => {
  FIXTURE.jds.forEach((jd, i) => {
    describe(FIXTURE.dates[i] ?? String(jd), () => {
      for (const planet of PLANETS) {
        it(`${planet} is within 3x JPL's long-window error`, () => {
          const frame = OUTER.has(planet) ? frames.barycentric : frames.heliocentric
          const truth = frame[planet]?.[i]
          expect(truth).toBeDefined()
          if (!truth) return
          const got = heliocentric(planet, jd)
          const [lonErr, distErr] = JPL_ERROR_T2[planet]
          expect(got.table).toBe(2)
          expect(got.outOfRange).toBe(false)
          expect(angleDiff(lon(got), lon(truth)) * ARCSEC).toBeLessThan(lonErr * ALLOWANCE)
          expect((Math.abs(dist(got) - dist(truth)) * AU_KM) / 1000).toBeLessThan(
            distErr * ALLOWANCE,
          )
        })
      }
    })
  })
})

describe('table choice (#91)', () => {
  it('uses Table 1 inside 1800–2050', () => {
    expect(heliocentric('Mars', jdFromDate(new Date('2026-11-06T00:00:00Z'))).table).toBe(1)
  })

  it('uses Table 2 outside it, and flags only dates past 3000 BC – 3000 AD', () => {
    const late = heliocentric('Earth', jdFromDate(new Date('2075-01-01T00:00:00Z')))
    expect(late.table).toBe(2)
    expect(late.outOfRange).toBe(false)
    const far = heliocentric('Earth', jdFromDate(new Date('3500-01-01T00:00:00Z')))
    expect(far.table).toBe(2)
    expect(far.outOfRange).toBe(true)
  })
})
