/**
 * Orbit lines for comets (#99): the conic drawn as a line, sampled in true anomaly and
 * cut at a radius, so a near-parabolic comet's 1,600 au aphelion never stretches the
 * scene. A line, never a position: the marker comes from Horizons' samples.
 */
import { describe, expect, it } from 'vitest'

import { type ConicElements, conicPath, conicPointAt, conicPosition } from '@/lib/orrery/conic'

// 24P/Schaumasse, JPL#K264/33 (tests/unit/orrery-conic.test.ts): Q = 6.9 au.
const SCHAUMASSE: ConicElements = {
  e: 0.707909552000865,
  q: 1.184637149648941,
  tp: 2461049.0592441433,
  om: 78.28793113152491,
  w: 58.47910605334581,
  i: 11.50232943610609,
}
// C/2026 A2 (Bok) from /api/orrery-smallbodies, 2026-11-12: e 0.9976, aphelion ~1,640 au.
const BOK: ConicElements = {
  e: 0.9976432395256172,
  q: 1.937799425332186,
  tp: 2461300,
  om: 120,
  w: 40,
  i: 60,
}
// 3I/ATLAS, JPL#55.
const ATLAS_3I: ConicElements = {
  e: 6.123467394525528,
  q: 1.351998619400212,
  tp: 2460977.9417958809,
  om: 323.0251782090054,
  w: 128.7969426041922,
  i: 175.2403121571192,
}
const PARABOLA: ConicElements = { ...BOK, e: 1 }

const r = (p: { x: number; y: number; z: number }) => Math.hypot(p.x, p.y, p.z)
const finite = (p: { x: number; y: number; z: number }) =>
  Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)

describe('conicPointAt', () => {
  it('is the perihelion point at ν = 0, where conicPosition puts the body at tp', () => {
    for (const el of [SCHAUMASSE, BOK, ATLAS_3I, PARABOLA]) {
      const a = conicPointAt(el, 0)
      const b = conicPosition(el, el.tp)
      expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeLessThan(1e-9)
      expect(r(a)).toBeCloseTo(el.q, 9)
    }
  })

  it('lies on the same conic as conicPosition a month after perihelion', () => {
    const p = conicPosition(SCHAUMASSE, SCHAUMASSE.tp + 30)
    // True anomaly from r = q(1+e)/(1+e cos ν), on the outbound side.
    const nu = Math.acos(((SCHAUMASSE.q * (1 + SCHAUMASSE.e)) / p.r - 1) / SCHAUMASSE.e)
    const a = conicPointAt(SCHAUMASSE, nu)
    expect(Math.hypot(a.x - p.x, a.y - p.y, a.z - p.z)).toBeLessThan(1e-9)
  })
})

describe('conicPath', () => {
  it('closes a bounded ellipse whose aphelion is inside the cut', () => {
    const path = conicPath(SCHAUMASSE, 20)
    expect(path.closed).toBe(true)
    expect(path.points.length).toBeGreaterThan(100)
    const q = SCHAUMASSE.q
    const aphelion = (q * (1 + SCHAUMASSE.e)) / (1 - SCHAUMASSE.e)
    const radii = path.points.map(r)
    expect(Math.min(...radii)).toBeCloseTo(q, 6)
    expect(Math.max(...radii)).toBeCloseTo(aphelion, 3)
  })

  it('draws a near-parabolic ellipse as an open arc cut at the radius', () => {
    const path = conicPath(BOK, 12)
    expect(path.closed).toBe(false)
    const radii = path.points.map(r)
    expect(Math.max(...radii)).toBeLessThanOrEqual(12 + 1e-9)
    expect(Math.max(...radii)).toBeCloseTo(12, 6)
    expect(Math.min(...radii)).toBeCloseTo(BOK.q, 6)
    expect(path.points.every(finite)).toBe(true)
  })

  it('draws a hyperbola and a parabola as open arcs, both ends at the cut', () => {
    for (const el of [ATLAS_3I, PARABOLA]) {
      const path = conicPath(el, 10)
      expect(path.closed).toBe(false)
      expect(path.points.every(finite)).toBe(true)
      const first = path.points[0]
      const last = path.points.at(-1)
      expect(first && r(first)).toBeCloseTo(10, 6)
      expect(last && r(last)).toBeCloseTo(10, 6)
    }
  })

  it('draws nothing when the whole orbit lies outside the cut', () => {
    expect(conicPath(SCHAUMASSE, 1).points).toEqual([])
  })

  it('draws nothing for elements that are not numbers', () => {
    expect(conicPath({ ...SCHAUMASSE, e: Number.NaN }, 10).points).toEqual([])
    expect(conicPath({ ...SCHAUMASSE, q: 0 }, 10).points).toEqual([])
  })
})
