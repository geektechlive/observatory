/**
 * Interpolating Horizons samples (#93). The oracle is Horizons itself: fixtures sampled
 * every 12 h; the track keeps only the whole days, and the 12 h rows it dropped are what
 * the interpolation must reproduce.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { type HorizonsSample, parseHorizonsVectors } from '@/lib/horizons'
import { rangeRateFromStates, stateAt, trajectoryPoints } from '@/lib/orrery/ephemeris'
import { AU_KM } from '@/lib/orrery/units'
import type { OrreryTrack } from '@/schemas/orreryBodies'

const samples = (name: string): HorizonsSample[] =>
  parseHorizonsVectors(readFileSync(join(__dirname, 'fixtures', 'horizons', `${name}.txt`), 'utf8'))
    ?.samples ?? []

/** A track from the whole-day rows only (indices 0, 2, 4 of a 12 h fixture). */
function trackFrom(name: string, opts: { coarse?: boolean } = {}): OrreryTrack {
  const day = samples(name).filter((_, i) => i % 2 === 0)
  const first = day[0]
  const fine = {
    start: first?.jd ?? 0,
    step: 1,
    samples: day.flatMap((s) => [s.x, s.y, s.z, s.vx, s.vy, s.vz]),
  }
  const coarse = { start: first?.jd ?? 0, step: 1, samples: day.flatMap((s) => [s.x, s.y, s.z]) }
  return {
    id: `fixture:${name}`,
    naifId: '0',
    name,
    mission: 'test',
    category: 'spacecraft',
    group: 'mission',
    target: null,
    observedUntil: null,
    availableFrom: null,
    availableTo: null,
    fine: opts.coarse ? null : fine,
    coarse,
  }
}

const km = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) * AU_KM

describe('stateAt: cubic Hermite on the fine span', () => {
  // Expected size of the error: |p''''|·h⁴/384. Earth (1 au, 2π/365 rad/day) is ~1e-13 au;
  // the Moon's monthly wobble about Earth (0.0026 au, 0.23 rad/day) is ~2e-8 au, 3 km.
  const cases: [string, number][] = [
    ['earth', 1],
    ['jwst', 5],
    ['voyager1', 1],
    ['voyager2', 1],
    ['moon', 15],
  ]
  for (const [name, toleranceKm] of cases) {
    it(`${name}: reproduces Horizons' 12 h samples within ${String(toleranceKm)} km`, () => {
      const track = trackFrom(name)
      for (const mid of samples(name).filter((_, i) => i % 2 === 1)) {
        const s = stateAt(track, mid.jd)
        expect(s?.resolution).toBe('fine')
        expect(km(s?.position ?? { x: 0, y: 0, z: 0 }, mid)).toBeLessThan(toleranceKm)
        // Velocity within 1 m/s (au/day → km/s is ×1731.5).
        const v = s?.velocity ?? { x: 0, y: 0, z: 0 }
        const dv = Math.hypot(v.x - mid.vx, v.y - mid.vy, v.z - mid.vz) * (AU_KM / 86_400)
        expect(dv).toBeLessThan(0.001)
      }
    })
  }

  it('hits the samples exactly at their own times', () => {
    const track = trackFrom('earth')
    const first = samples('earth')[0]
    const s = stateAt(track, first?.jd ?? 0)
    expect(km(s?.position ?? { x: 0, y: 0, z: 0 }, first ?? { x: 1, y: 1, z: 1 })).toBeLessThan(
      1e-6,
    )
  })
})

describe('stateAt: outside the data, nothing (never extrapolate)', () => {
  it('returns null before the first sample and after the last', () => {
    const track = trackFrom('earth')
    const all = samples('earth')
    expect(stateAt(track, (all[0]?.jd ?? 0) - 0.01)).toBeNull()
    expect(stateAt(track, (all.at(-1)?.jd ?? 0) + 0.01)).toBeNull()
  })

  it('returns null for a track with no spans', () => {
    expect(stateAt({ ...trackFrom('earth'), fine: null, coarse: null }, 2461350)).toBeNull()
  })
})

describe('stateAt: the coarse span outside the fine window', () => {
  it('uses the coarse positions, marked coarse, close to the truth', () => {
    const track = trackFrom('earth', { coarse: true })
    const mid = samples('earth')[1]
    const s = stateAt(track, mid?.jd ?? 0)
    expect(s?.resolution).toBe('coarse')
    // Catmull-Rom estimates the tangents from neighbours, one-sided at the span's ends:
    // much looser than Hermite (2,824 km here, with only three samples), hence 'coarse'.
    expect(km(s?.position ?? { x: 0, y: 0, z: 0 }, mid ?? { x: 0, y: 0, z: 0 })).toBeLessThan(5000)
  })
})

describe('trajectoryPoints', () => {
  it('lists the coarse positions with their dates, oldest first', () => {
    const pts = trajectoryPoints(trackFrom('earth'))
    expect(pts).toHaveLength(3)
    expect(pts[1]?.jd).toBe((pts[0]?.jd ?? 0) + 1)
  })
})

describe('rangeRateFromStates (spec Part 5.10)', () => {
  const origin = { x: 0, y: 0, z: 0 }
  it('is positive while receding', () => {
    const r = rangeRateFromStates({ x: 1, y: 0, z: 0 }, { x: 0.01, y: 0, z: 0 }, origin, origin)
    expect(r).toBeCloseTo((0.01 * AU_KM) / 86_400, 6)
  })

  it('is negative while approaching', () => {
    const r = rangeRateFromStates({ x: 1, y: 0, z: 0 }, { x: -0.01, y: 0, z: 0 }, origin, origin)
    expect(r).toBeLessThan(0)
  })

  it('ignores motion across the line of sight', () => {
    const r = rangeRateFromStates({ x: 1, y: 0, z: 0 }, { x: 0, y: 0.01, z: 0 }, origin, origin)
    expect(Math.abs(r)).toBeLessThan(1e-9)
  })

  it('is 0, not NaN, at zero separation', () => {
    expect(rangeRateFromStates(origin, { x: 1, y: 0, z: 0 }, origin, origin)).toBe(0)
  })
})
