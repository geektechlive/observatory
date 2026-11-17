/**
 * What surrounds a craft in the fly-in (#261): every body's true position relative to the
 * craft at a date, from the same sources the orrery uses (Horizons for the craft, Earth and
 * the moons; JPL's approximate elements for the other planets), and the moons with no data
 * for the date named rather than guessed.
 */
import { describe, expect, it } from 'vitest'

import { heliocentric } from '@/lib/orrery/kepler'
import type { MoonBody } from '@/lib/orrery/moonState'
import { surroundingsAt } from '@/lib/orrery/surroundings'
import { BODY_RADIUS_KM, MOON_RADIUS_KM } from '@/lib/orrery/trueScale'
import { AU_KM } from '@/lib/orrery/units'

const JD = 2_461_000.5

/** A craft parked at `at` (au) for ten days either side of JD. */
function parked(at: [number, number, number]) {
  const samples: number[] = []
  for (let i = 0; i <= 20; i += 1) samples.push(...at, 0, 0, 0)
  return { fine: { start: JD - 10, step: 1, samples }, coarse: null }
}

function moon(
  key: string,
  name: string,
  parent: 'Jupiter' | 'Earth',
  from: number,
  to: number,
): MoonBody {
  return {
    key,
    name,
    parent,
    periodDays: 1,
    semiMajorAxisKm: 400_000,
    center: '',
    target: null,
    spans: [],
    relative: (jd) =>
      jd >= from && jd <= to
        ? { position: { x: 0.002, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, resolution: 'fine' }
        : null,
  }
}

describe('surroundingsAt (#261)', () => {
  it('is null outside the craft’s data', () => {
    expect(surroundingsAt(parked([0.05, 0, 0]), null, [], JD + 30)).toBeNull()
  })

  it('puts the Sun at minus the craft’s position, in km, at its true radius', () => {
    const s = surroundingsAt(parked([0.05, 0, 0]), null, [], JD)
    const sun = s?.bodies.find((b) => b.name === 'Sun')
    expect(sun?.relKm[0]).toBeCloseTo(-0.05 * AU_KM, 0)
    expect(sun?.radiusKm).toBe(BODY_RADIUS_KM.Sun)
    expect(sun?.kind).toBe('sun')
  })

  it('places every planet from its elements, relative to the craft', () => {
    const s = surroundingsAt(parked([0.05, 0, 0]), null, [], JD)
    const planets = s?.bodies.filter((b) => b.kind === 'planet') ?? []
    expect(planets.map((p) => p.name)).toEqual([
      'Mercury',
      'Venus',
      'Earth',
      'Mars',
      'Jupiter',
      'Saturn',
      'Uranus',
      'Neptune',
    ])
    const mars = heliocentric('Mars', JD)
    const m = planets.find((p) => p.name === 'Mars')
    expect(m?.relKm[1]).toBeCloseTo(mars.y * AU_KM, 0)
    expect(m?.radiusKm).toBe(BODY_RADIUS_KM.Mars)
  })

  it('places a moon from its planet, with its JPL radius; one without data is named, not drawn', () => {
    const io = moon('naif:501', 'Io', 'Jupiter', JD - 1, JD + 1)
    const europa = moon('naif:502', 'Europa', 'Jupiter', JD + 5, JD + 6)
    const s = surroundingsAt(parked([0.05, 0, 0]), null, [io, europa], JD)
    const i = s?.bodies.find((b) => b.name === 'Io')
    const jupiter = s?.bodies.find((b) => b.name === 'Jupiter')
    expect(i?.kind).toBe('moon')
    expect(i?.radiusKm).toBe(1_821.49)
    expect((i?.relKm[0] ?? 0) - (jupiter?.relKm[0] ?? 0)).toBeCloseTo(0.002 * AU_KM, 0)
    expect(s?.bodies.some((b) => b.name === 'Europa')).toBe(false)
    expect(s?.omitted).toEqual(['Europa'])
  })

  it('names a missing moon as near only when its planet is within 0.2 au of the craft', () => {
    const europa = moon('naif:502', 'Europa', 'Jupiter', JD + 5, JD + 6)
    const far = surroundingsAt(parked([0.05, 0, 0]), null, [europa], JD)
    expect(far?.omittedNear).toEqual([])
    const j = heliocentric('Jupiter', JD)
    const beside = surroundingsAt(parked([j.x + 0.01, j.y, j.z]), null, [europa], JD)
    expect(beside?.omittedNear).toEqual(['Europa'])
  })

  it('gives Earth’s Moon its own radius', () => {
    const s = surroundingsAt(
      parked([0.05, 0, 0]),
      null,
      [moon('naif:301', 'Moon', 'Earth', JD - 1, JD + 1)],
      JD,
    )
    expect(s?.bodies.find((b) => b.name === 'Moon')?.radiusKm).toBe(MOON_RADIUS_KM)
  })
})
