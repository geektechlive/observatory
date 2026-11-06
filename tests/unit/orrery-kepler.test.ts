/**
 * The orrery's planet positions (#90), against JPL Horizons. JPL states the nominal errors
 * of its approximate elements for 1800–2050 ("Approximate Positions of the Planets",
 * https://ssd.jpl.nasa.gov/planets/approx_pos.html, accuracy table): heliocentric
 * longitude in arcsec and distance in 1000 km. These tests allow three times that.
 *
 * Jupiter to Neptune are checked against Horizons' barycentric positions. Table 1 tracks
 * the outer planets about the solar-system barycentre, which sits up to ~0.01 au from the
 * Sun's centre: measured 2026-11-06, our Neptune was 2.8″ and 6.2″ from barycentric at the
 * two epochs, and 32″ and 45″ from Sun-centred. On the orrery that offset is under a pixel,
 * so a looser Sun-centred check (below) guards what is drawn.
 */
import { describe, expect, it } from 'vitest'

import { heliocentric, jdFromDate, type PlanetName, PLANETS, solveKepler } from '@/lib/orrery'

import FIXTURE from './fixtures/horizons-helio.json'

const AU_KM = 149_597_870.7
const ARCSEC = 3600

/** JPL's 1800–2050 table: [longitude arcsec, distance 1000 km]. */
const JPL_ERROR: Record<PlanetName, [number, number]> = {
  Mercury: [15, 1],
  Venus: [20, 4],
  Earth: [20, 6],
  Mars: [40, 25],
  Jupiter: [400, 600],
  Saturn: [600, 1500],
  Uranus: [50, 1000],
  Neptune: [10, 200],
}
const ALLOWANCE = 3

/** The fixture names the Earth–Moon barycentre by its Horizons name. */
const FIXTURE_NAME: Record<PlanetName, string> = {
  Mercury: 'Mercury',
  Venus: 'Venus',
  Earth: 'EMBary',
  Mars: 'Mars',
  Jupiter: 'Jupiter',
  Saturn: 'Saturn',
  Uranus: 'Uranus',
  Neptune: 'Neptune',
}

type Vec = { x: number; y: number; z: number }
const lon = (v: Vec) => Math.atan2(v.y, v.x) * (180 / Math.PI)
const dist = (v: Vec) => Math.hypot(v.x, v.y, v.z)
/** Smallest difference between two angles, in degrees. */
const angleDiff = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180)

const OUTER: readonly PlanetName[] = ['Jupiter', 'Saturn', 'Uranus', 'Neptune']
/** The Sun's offset from the barycentre, at most ~0.01 au: 1.5 million km. */
const SUN_WOBBLE_AU = 0.01

const vec = (v: number[] | undefined): Vec => {
  const [x = NaN, y = NaN, z = NaN] = v ?? []
  return { x, y, z }
}

describe('heliocentric (#90) against JPL Horizons', () => {
  for (const epoch of FIXTURE.epochs) {
    describe(epoch.label, () => {
      for (const planet of PLANETS) {
        it(`${planet} is within 3x JPL's stated error`, () => {
          const frame = OUTER.includes(planet) ? epoch.barycentric : epoch.bodies
          const truth = vec((frame as Record<string, number[]>)[FIXTURE_NAME[planet]])
          const got = heliocentric(planet, epoch.jd)
          const [lonErr, distErr] = JPL_ERROR[planet]
          expect(got.outOfRange).toBe(false)
          expect(angleDiff(lon(got), lon(truth)) * ARCSEC).toBeLessThan(lonErr * ALLOWANCE)
          expect((Math.abs(dist(got) - dist(truth)) * AU_KM) / 1000).toBeLessThan(
            distErr * ALLOWANCE,
          )
        })
      }

      for (const planet of OUTER) {
        it(`${planet} is within its error plus the Sun's wobble of where it is drawn`, () => {
          const truth = vec((epoch.bodies as Record<string, number[]>)[FIXTURE_NAME[planet]])
          const got = heliocentric(planet, epoch.jd)
          const [lonErr, distErr] = JPL_ERROR[planet]
          // JPL's error as a distance: the longitude error across the orbit, plus the radial one.
          const errAu =
            ALLOWANCE *
            ((lonErr / ARCSEC) * (Math.PI / 180) * dist(truth) + (distErr * 1000) / AU_KM)
          expect(Math.hypot(got.x - truth.x, got.y - truth.y, got.z - truth.z)).toBeLessThan(
            errAu + SUN_WOBBLE_AU,
          )
        })
      }
    })
  }
})

describe('solveKepler (#90)', () => {
  const residual = (M: number, e: number, E: number) =>
    Math.abs(M - (E - (180 / Math.PI) * e * Math.sin((E * Math.PI) / 180)))

  it('solves an eccentric orbit (e = 0.2) to better than 1e-6 degrees', () => {
    for (const M of [-170, -90, -10, 0, 10, 90, 170]) {
      expect(residual(M, 0.2, solveKepler(M, 0.2))).toBeLessThan(1e-6)
    }
  })

  it('handles the ends of the range, M = ±180 degrees', () => {
    expect(Math.abs(solveKepler(180, 0.2))).toBeCloseTo(180, 6)
    expect(Math.abs(solveKepler(-180, 0.2))).toBeCloseTo(180, 6)
  })

  it('is the identity on a circular orbit', () => {
    expect(solveKepler(42, 0)).toBeCloseTo(42, 9)
  })
})

describe('validity window (#90)', () => {
  it('flags a date outside 1800–2050, where JPL says the elements are not valid', () => {
    expect(heliocentric('Earth', jdFromDate(new Date('2075-01-01T00:00:00Z'))).outOfRange).toBe(
      true,
    )
    expect(heliocentric('Earth', jdFromDate(new Date('1750-01-01T00:00:00Z'))).outOfRange).toBe(
      true,
    )
  })

  it('does not flag today', () => {
    expect(heliocentric('Mars', jdFromDate(new Date('2026-11-06T00:00:00Z'))).outOfRange).toBe(
      false,
    )
  })
})

describe('jdFromDate (#90)', () => {
  it('maps J2000.0 to JD 2451545.0', () => {
    expect(jdFromDate(new Date('2000-01-01T12:00:00Z'))).toBe(2451545.0)
  })
})
