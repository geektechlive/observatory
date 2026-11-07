/**
 * The orrery's major moons (#107): the catalogue, the sampling step, interpolation of
 * planet-centred Horizons vectors, and the exaggerated local scale that places a moon
 * around its drawn planet. The oracle for interpolation is Horizons itself: Io sampled
 * every 90 min; the track keeps the 3 h rows (the job's step for Io), and the 90 min
 * rows it dropped are what Hermite must reproduce.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { type HorizonsSample, parseHorizonsVectors } from '@/lib/horizons'
import { stateAt } from '@/lib/orrery/ephemeris'
import { moonScenePosition } from '@/lib/orrery/moonPlacement'
import {
  MOON_MAX_SAMPLES,
  MOON_SAMPLES_PER_ORBIT,
  MOON_STEPS_DAYS,
  MOON_WINDOW_DAYS,
  MOONS,
  moonStepDays,
  moonWindowDays,
} from '@/lib/orrery/moons'
import { AU_KM } from '@/lib/orrery/units'
import { OrreryBodiesSchema } from '@/schemas/orreryBodies'

const read = (name: string) =>
  readFileSync(join(__dirname, 'fixtures', 'horizons', `${name}.txt`), 'utf8')
const samples = (name: string): HorizonsSample[] => parseHorizonsVectors(read(name))?.samples ?? []

describe('MOONS catalogue', () => {
  it('lists the major moons of the giant planets with their Horizons ids and parents', () => {
    const byName = new Map(MOONS.map((m) => [m.name, m]))
    expect(byName.get('Io')).toMatchObject({
      naifId: '501',
      parent: { naifId: '599', name: 'Jupiter' },
    })
    expect(byName.get('Titan')).toMatchObject({
      naifId: '606',
      parent: { naifId: '699', name: 'Saturn' },
    })
    expect(byName.get('Triton')).toMatchObject({
      naifId: '801',
      parent: { naifId: '899', name: 'Neptune' },
    })
    expect(byName.get('Titania')).toMatchObject({
      naifId: '703',
      parent: { naifId: '799', name: 'Uranus' },
    })
    for (const name of [
      'Europa',
      'Ganymede',
      'Callisto',
      'Enceladus',
      'Rhea',
      'Iapetus',
      'Miranda',
      'Oberon',
    ]) {
      expect(byName.has(name), name).toBe(true)
    }
  })

  it('has unique ids, each moon numbered under its own planet (NAIF: planet 599 → moons 5xx)', () => {
    expect(new Set(MOONS.map((m) => m.naifId)).size).toBe(MOONS.length)
    for (const m of MOONS) expect(m.naifId[0], m.name).toBe(m.parent.naifId[0])
  })

  it('carries period and semi-major axis from Horizons physical data', () => {
    const io = MOONS.find((m) => m.name === 'Io')
    expect(io?.periodDays).toBeCloseTo(1.77, 2)
    expect(io?.semiMajorAxisKm).toBe(422_000)
    for (const m of MOONS) {
      expect(m.periodDays, m.name).toBeGreaterThan(0.3)
      expect(m.semiMajorAxisKm, m.name).toBeGreaterThan(9_000)
      expect(m.source, m.name).toMatch(/Horizons/)
    }
  })

  it("lists Mars's two moons, checked live against Horizons (Chris: no Mars moons)", () => {
    const byName = new Map(MOONS.map((m) => [m.name, m]))
    expect(byName.get('Phobos')).toMatchObject({
      naifId: '401',
      parent: { naifId: '499', name: 'Mars' },
      periodDays: 0.319,
      semiMajorAxisKm: 9_377.2,
    })
    expect(byName.get('Deimos')).toMatchObject({
      naifId: '402',
      parent: { naifId: '499', name: 'Mars' },
      periodDays: 1.263,
      semiMajorAxisKm: 23_463.2,
    })
  })
})

describe('moonWindowDays', () => {
  it('keeps the slow moons on the full window', () => {
    for (const name of ['Io', 'Enceladus', 'Miranda', 'Titan', 'Iapetus']) {
      const m = MOONS.find((x) => x.name === name)
      expect(moonWindowDays(m?.periodDays ?? 0), name).toBe(MOON_WINDOW_DAYS)
    }
  })

  it("shortens a fast moon's window so no moon carries more than MOON_MAX_SAMPLES", () => {
    expect(moonWindowDays(0.319)).toBe(4) // Phobos: 30 min steps, ±4 days
    for (const m of MOONS) {
      const samples = (2 * moonWindowDays(m.periodDays)) / moonStepDays(m.periodDays) + 1
      expect(samples, m.name).toBeLessThanOrEqual(MOON_MAX_SAMPLES + 1)
      expect(moonWindowDays(m.periodDays), m.name).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('moonStepDays', () => {
  it('samples every moon at least MOON_SAMPLES_PER_ORBIT times per orbit, on a Horizons-friendly step', () => {
    for (const m of MOONS) {
      const step = moonStepDays(m.periodDays)
      expect(MOON_STEPS_DAYS, m.name).toContain(step)
      expect(m.periodDays / step, m.name).toBeGreaterThanOrEqual(MOON_SAMPLES_PER_ORBIT)
    }
  })

  it('takes the coarsest step that still meets the rate', () => {
    expect(moonStepDays(1.77)).toBe(1 / 8) // Io: 3 h
    expect(moonStepDays(1.370218)).toBe(1 / 12) // Enceladus: 2 h
    expect(moonStepDays(15.945421)).toBe(1) // Titan: 1 d
    expect(moonStepDays(79.33)).toBe(1) // Iapetus: never coarser than a day
    expect(moonStepDays(0.319)).toBe(1 / 48) // Phobos: 30 min
    expect(moonStepDays(1.263)).toBe(1 / 12) // Deimos: 2 h
  })

  it('keeps the window short enough to keep the payload small', () => {
    expect(MOON_WINDOW_DAYS).toBeLessThanOrEqual(30)
  })
})

describe('planet-centred Horizons vectors', () => {
  it('parses Io around Jupiter and Titan around Saturn, naming the target', () => {
    expect(parseHorizonsVectors(read('io'))?.target).toBe('Io (501)')
    expect(parseHorizonsVectors(read('titan'))?.target).toBe('Titan (606)')
    expect(read('io')).toMatch(/Center body name: Jupiter \(599\)/)
    expect(samples('titan')).toHaveLength(5)
  })

  it('puts each moon at its orbital distance from the planet', () => {
    for (const s of samples('io')) {
      expect(Math.hypot(s.x, s.y, s.z) * AU_KM).toBeGreaterThan(415_000)
      expect(Math.hypot(s.x, s.y, s.z) * AU_KM).toBeLessThan(430_000)
    }
    for (const s of samples('titan')) {
      expect(Math.hypot(s.x, s.y, s.z) * AU_KM).toBeGreaterThan(1_180_000)
      expect(Math.hypot(s.x, s.y, s.z) * AU_KM).toBeLessThan(1_260_000)
    }
  })

  it('reproduces Horizons between 3 h samples of Io to within 100 km (Hermite)', () => {
    const all = samples('io')
    expect(all).toHaveLength(9)
    const kept = all.filter((_, i) => i % 2 === 0)
    const first = kept[0] as HorizonsSample
    const track = {
      fine: {
        start: first.jd,
        step: 1 / 8,
        samples: kept.flatMap((s) => [s.x, s.y, s.z, s.vx, s.vy, s.vz]),
      },
      coarse: null,
    }
    for (const truth of all.filter((_, i) => i % 2 === 1)) {
      const got = stateAt(track, truth.jd)
      expect(got).not.toBeNull()
      const errKm =
        Math.hypot(
          (got?.position.x ?? 0) - truth.x,
          (got?.position.y ?? 0) - truth.y,
          (got?.position.z ?? 0) - truth.z,
        ) * AU_KM
      expect(errKm).toBeLessThan(100)
    }
  })
})

describe('OrreryBodiesSchema with moons', () => {
  const base = {
    generatedAt: '2026-11-07T00:00:00.000Z',
    coarseFetchedAt: null,
    frame: 'ecliptic-J2000',
    center: 'Sun',
    timeScale: 'TDB',
    units: { position: 'au', velocity: 'au/day' },
    sourceType: 'ephemeris',
    provider: 'jpl-horizons',
    bodies: [],
    missing: [],
  }
  const io = {
    id: 'naif:501',
    naifId: '501',
    name: 'Io',
    parent: { naifId: '599', name: 'Jupiter' },
    center: '500@599',
    target: 'Io (501)',
    periodDays: 1.77,
    semiMajorAxisKm: 422_000,
    fine: { start: 2461351.5, step: 0.125, samples: [0.001, 0.002, 0, -0.008, 0.006, 0] },
  }

  it('reads a copy written before moons existed as having none', () => {
    expect(OrreryBodiesSchema.parse(base).moons).toEqual([])
  })

  it('reads moons with their parent and centre', () => {
    expect(OrreryBodiesSchema.parse({ ...base, moons: [io] }).moons[0]?.parent.name).toBe('Jupiter')
  })

  it('lets a reader that predates moons ignore them (no KV key bump needed)', () => {
    // The deployed client's schema is this one without `moons`; zod objects strip
    // unknown keys, so the planet-centred vectors never reach its heliocentric code.
    const old = OrreryBodiesSchema.omit({ moons: true })
    const parsed = old.parse({ ...base, moons: [io] })
    expect('moons' in parsed).toBe(false)
  })
})

describe('moonScenePosition', () => {
  const parent = { x: 40, y: 1, z: -12 }
  const R = 0.5
  const km = (x: number, y: number, z: number) => ({ x: x / AU_KM, y: y / AU_KM, z: z / AU_KM })
  const dist = (p: { x: number; y: number; z: number }) =>
    Math.hypot(p.x - parent.x, p.y - parent.y, p.z - parent.z)

  it('places every moon outside the planet as drawn', () => {
    for (const m of MOONS) {
      const p = moonScenePosition(parent, km(m.semiMajorAxisKm, 0, 0), R)
      expect(dist(p), m.name).toBeGreaterThan(R * 1.2)
    }
    // Even a moon grazing the planet stays clear of it.
    expect(dist(moonScenePosition(parent, km(1, 0, 0), R))).toBeGreaterThan(R * 1.2)
  })

  it('keeps the order of distances: Io, Europa, Ganymede, Callisto outward', () => {
    const jovian = ['Io', 'Europa', 'Ganymede', 'Callisto'].map((n) => {
      const m = MOONS.find((x) => x.name === n)
      return dist(moonScenePosition(parent, km(m?.semiMajorAxisKm ?? 0, 0, 0), R))
    })
    for (let i = 1; i < jovian.length; i += 1) {
      expect(jovian[i]).toBeGreaterThan(jovian[i - 1] as number)
    }
  })

  it('maps distance monotonically and scales with the drawn radius', () => {
    let last = 0
    for (let d = 50_000; d <= 4_000_000; d += 50_000) {
      const r = dist(moonScenePosition(parent, km(d, 0, 0), R))
      expect(r).toBeGreaterThan(last)
      last = r
    }
    const near = dist(moonScenePosition(parent, km(422_000, 0, 0), R))
    const big = dist(moonScenePosition(parent, km(422_000, 0, 0), 2 * R))
    expect(big).toBeCloseTo(2 * near, 9)
  })

  it('keeps the direction, with the same axes as place3d (ecliptic z up, ecliptic y to scene −z)', () => {
    const up = moonScenePosition(parent, km(0, 0, 500_000), R)
    expect(up.x).toBeCloseTo(parent.x, 9)
    expect(up.y).toBeGreaterThan(parent.y)
    expect(up.z).toBeCloseTo(parent.z, 9)
    const east = moonScenePosition(parent, km(0, 500_000, 0), R)
    expect(east.z).toBeLessThan(parent.z)
    expect(east.y).toBeCloseTo(parent.y, 9)
  })

  it('puts a moon with no offset at the planet', () => {
    expect(moonScenePosition(parent, { x: 0, y: 0, z: 0 }, R)).toEqual(parent)
  })
})
