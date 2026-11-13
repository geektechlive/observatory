/**
 * "Which bright asteroids are up tonight, and when" (#99 item 4): the same Horizons-sample
 * sky maths as the comets, with the H,G magnitude law and point-source reach limits.
 */
import { describe, expect, it } from 'vitest'

import { asteroidMagnitude, phaseAngleDeg } from '@/lib/orrery/smallBodies'
import {
  asteroidReachOf,
  asteroidsTonight,
  FAINTEST_ASTEROID_LISTED,
  MAX_ASTEROIDS_LISTED,
  skyRun,
  type TonightAsteroidCandidate,
} from '@/lib/sky/asteroidsTonight'
import { MIN_ALTITUDE } from '@/lib/sky/cometsTonight'
import { topocentric } from '@/lib/sky/topocentric'

import fixture from './fixtures/tonight/c2024t5-kittpeak.json'

const MIN = 60_000
const [lonText, latText] = fixture.siteGeodetic.split(',')
const KITT_PEAK = { lat: Number(latText), lon: Number(lonText) - 360 }
const WINDOW = { start: new Date('2026-11-07T02:00:00Z'), end: new Date('2026-11-07T12:00:00Z') }

/** T5's real Horizons samples stand in for an asteroid's: any sampled object will do. */
const rock = (id: string, h: number): TonightAsteroidCandidate => ({
  id,
  spkid: id.slice(3),
  name: `${id} test`,
  h,
  g: 0.15,
  gAssumed: true,
  fine: fixture.comet.fine,
  coarse: null,
})

/** The run of 10-minute samples at or above MIN_ALTITUDE, by brute force. */
function bruteForce(body: TonightAsteroidCandidate) {
  const ups: { t: number; alt: number }[] = []
  for (let t = WINDOW.start.getTime(); t <= WINDOW.end.getTime(); t += 10 * MIN) {
    const sky = topocentric(body, new Date(t), KITT_PEAK)
    if (sky && sky.altitude >= MIN_ALTITUDE) ups.push({ t, alt: sky.altitude })
  }
  return ups
}

describe('skyRun', () => {
  it('reports when it is above 10 degrees and where it stands highest, as 10-minute samples', () => {
    const body = rock('sb:20000001', 6)
    const ups = bruteForce(body)
    expect(ups.length).toBeGreaterThan(3)
    const run = skyRun(body, KITT_PEAK, WINDOW)
    expect(run).not.toBeNull()
    expect(run?.from.getTime()).toBe(ups[0]?.t)
    expect(run?.to.getTime()).toBe(ups[ups.length - 1]?.t)
    const top = ups.reduce((a, b) => (b.alt > a.alt ? b : a))
    expect(run?.best.getTime()).toBe(top.t)
    expect(run?.altitude).toBeCloseTo(top.alt, 6)
    expect(run?.direction).toMatch(/^[NESW]{1,3}$/)
  })

  it('is null for an object with no samples tonight', () => {
    const none = { ...rock('sb:20000002', 6), fine: null }
    expect(skyRun(none, KITT_PEAK, WINDOW)).toBeNull()
  })

  it('is null when the window leaves it below 10 degrees', () => {
    // Early afternoon at Kitt Peak: the object is nowhere near 10 degrees up.
    const day = { start: new Date('2026-11-07T19:00:00Z'), end: new Date('2026-11-07T20:00:00Z') }
    const body = rock('sb:20000003', 6)
    const high = topocentric(body, day.start, KITT_PEAK)
    expect(high && high.altitude < MIN_ALTITUDE).toBe(true)
    expect(skyRun(body, KITT_PEAK, day)).toBeNull()
  })
})

describe('asteroidsTonight', () => {
  it('gives the H,G magnitude where it stands highest, with the phase angle from the geometry', () => {
    const body = rock('sb:20000004', 0)
    const [row] = asteroidsTonight([body], KITT_PEAK, WINDOW)
    expect(row).toBeDefined()
    const sky = topocentric(body, row?.best ?? new Date(0), KITT_PEAK)
    expect(sky).not.toBeNull()
    if (!sky || !row) return
    const alpha = phaseAngleDeg(sky.r, sky.delta, sky.earthSun)
    expect(row.magnitude).toBeCloseTo(asteroidMagnitude(0, 0.15, sky.r, sky.delta, alpha), 9)
    expect(row.gAssumed).toBe(true)
  })

  it(`lists only those forecast at V ${String(FAINTEST_ASTEROID_LISTED)} or brighter`, () => {
    const bright = rock('sb:20000005', 0)
    const faint = rock('sb:20000006', 20)
    const rows = asteroidsTonight([bright, faint], KITT_PEAK, WINDOW)
    expect(rows.map((r) => r.id)).toEqual(['sb:20000005'])
  })

  it('lists at most ten, brightest first', () => {
    const many = Array.from({ length: 13 }, (_, i) =>
      rock(`sb:200001${String(10 + i)}`, -1 + i * 0.1),
    )
    const rows = asteroidsTonight(many, KITT_PEAK, WINDOW)
    expect(rows).toHaveLength(MAX_ASTEROIDS_LISTED)
    expect(rows.map((r) => r.magnitude)).toEqual(
      [...rows.map((r) => r.magnitude)].sort((a, b) => a - b),
    )
    expect(rows[0]?.id).toBe('sb:20000110')
  })
})

describe('asteroidReachOf', () => {
  it('uses star limits for a point of light, not the comets', () => {
    expect(asteroidReachOf(6.4)).toBe('naked-eye')
    expect(asteroidReachOf(6.6)).toBe('binoculars')
    expect(asteroidReachOf(10)).toBe('binoculars')
    expect(asteroidReachOf(10.1)).toBe('small-telescope')
    expect(asteroidReachOf(11)).toBe('small-telescope')
  })
})
