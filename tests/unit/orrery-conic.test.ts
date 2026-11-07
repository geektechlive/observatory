/**
 * Two-body positions on any conic (#99): ellipse, parabola and hyperbola. Comets and the
 * interstellar objects need the last two, which the spec's Part 5 leaves out. The
 * Horizons samples below were fetched live on 2026-11-07 (heliocentric ecliptic J2000,
 * au), with the osculating elements from the same answer's header.
 */
import { describe, expect, it } from 'vitest'

import {
  asymptoteDirections,
  type ConicElements,
  conicPosition,
  solveBarker,
  solveEllipticAnomaly,
  solveHyperbolicAnomaly,
  vInfinityKms,
} from '@/lib/orrery/conic'

const dist = (a: { x: number; y: number; z: number }, b: readonly number[]) =>
  Math.hypot(a.x - (b[0] ?? 0), a.y - (b[1] ?? 0), a.z - (b[2] ?? 0))

// 3I/ATLAS (C/2025 N1), JPL#55, epoch 2026-Oct-27.
const ATLAS_3I: ConicElements = {
  e: 6.123467394525528,
  q: 1.351998619400212,
  tp: 2460977.9417958809,
  om: 323.0251782090054,
  w: 128.7969426041922,
  i: 175.2403121571192,
}
// 24P/Schaumasse, JPL#K264/33, epoch 2024-Jan-12.
const SCHAUMASSE: ConicElements = {
  e: 0.707909552000865,
  q: 1.184637149648941,
  tp: 2461049.0592441433,
  om: 78.28793113152491,
  w: 58.47910605334581,
  i: 11.50232943610609,
}
// 1I/'Oumuamua (A/2017 U1) and 2I/Borisov (C/2019 Q4): e and q from their Horizons headers.
const OUMUAMUA = { e: 1.201133796102373, q: 0.2559115812959116 }
const BORISOV = { e: 3.356475782676596, q: 2.006520878500843 }

describe('Kepler solvers', () => {
  it('solves the elliptic equation from E0 = M below e = 0.8 and from π above it', () => {
    for (const [M, e] of [
      [1, 0.2],
      [0.01, 0.95],
      [-3.1, 0.999],
      [3.14, 0.5],
    ] as const) {
      const E = solveEllipticAnomaly(M, e)
      expect(Math.abs(E - e * Math.sin(E) - M)).toBeLessThan(1e-12)
    }
  })

  it('solves the hyperbolic equation e sinh H - H = M, both sides of perihelion', () => {
    for (const [M, e] of [
      [5, 1.2],
      [-40, 6.1],
      [1e-6, 1.0001],
      [300, 3.4],
    ] as const) {
      const H = solveHyperbolicAnomaly(M, e)
      expect(Math.abs(e * Math.sinh(H) - H - M) / Math.max(1, Math.abs(M))).toBeLessThan(1e-12)
    }
  })

  it("solves Barker's equation D + D³/3 = W in closed form", () => {
    for (const D of [-12, -0.3, 0, 0.01, 2, 50]) {
      expect(solveBarker(D + D ** 3 / 3)).toBeCloseTo(D, 9)
    }
  })
})

describe('conicPosition', () => {
  it('puts 3I/ATLAS within 2,000 km of Horizons five days after its epoch (hyperbola)', () => {
    const p = conicPosition(ATLAS_3I, 2461345.5)
    expect(dist(p, [-2.666221084574235, 12.58059028629743, -0.7033294052094843])).toBeLessThan(
      1.5e-5,
    )
  })

  it('puts 24P/Schaumasse within 3,000 km of Horizons ten days after its epoch (ellipse)', () => {
    const p = conicPosition(SCHAUMASSE, 2460331.5)
    expect(dist(p, [5.193849518768057, -1.601619286007386, -1.101075300660717])).toBeLessThan(2e-5)
  })

  it('is continuous through e = 1: near-ellipses and near-hyperbolas close on the parabola', () => {
    const base = { q: 0.5, tp: 2461000, om: 40, w: 100, i: 30 }
    for (const dt of [-200, -5, 0, 3, 90]) {
      const jd = base.tp + dt
      const parabola = conicPosition({ ...base, e: 1 }, jd)
      const gap = (e: number) =>
        dist(conicPosition({ ...base, e }, jd), [parabola.x, parabola.y, parabola.z])
      // The orbits really differ by about (e - 1) x r; the solver must not add to it.
      expect(gap(1 - 1e-8)).toBeLessThan(1e-6)
      expect(gap(1 + 1e-8)).toBeLessThan(1e-6)
      if (dt !== 0) {
        expect(gap(1 - 1e-6) / gap(1 - 1e-7)).toBeCloseTo(10, 0)
        expect(gap(1 + 1e-6) / gap(1 + 1e-7)).toBeCloseTo(10, 0)
      }
    }
  })

  it('sits at perihelion distance q at the time of perihelion, whatever the shape', () => {
    for (const e of [0.2, 1, 1.2, 6.1]) {
      const p = conicPosition({ e, q: 1.3, tp: 2460000, om: 10, w: 20, i: 30 }, 2460000)
      expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(1.3, 10)
      expect(p.r).toBeCloseTo(1.3, 10)
    }
  })
})

describe('interstellar objects', () => {
  it('gives each its speed far from the Sun, v∞', () => {
    expect(vInfinityKms(OUMUAMUA)).toBeCloseTo(26.3, 0)
    expect(vInfinityKms(BORISOV)).toBeCloseTo(32.3, 0)
    expect(vInfinityKms(ATLAS_3I)).toBeCloseTo(58, 0)
    expect(vInfinityKms(SCHAUMASSE)).toBeNull()
  })

  it("points 3I/ATLAS's inbound and outbound asymptotes along its path", () => {
    const { inbound, outbound } = asymptoteDirections(ATLAS_3I)
    // Far out on either leg, the position lines up with the asymptote.
    const far = (jd: number) => {
      const p = conicPosition(ATLAS_3I, jd)
      const r = Math.hypot(p.x, p.y, p.z)
      return [p.x / r, p.y / r, p.z / r]
    }
    const dot = (a: readonly number[], b: { x: number; y: number; z: number }) =>
      (a[0] ?? 0) * b.x + (a[1] ?? 0) * b.y + (a[2] ?? 0) * b.z
    expect(dot(far(ATLAS_3I.tp - 365 * 200), inbound)).toBeGreaterThan(0.9999)
    expect(dot(far(ATLAS_3I.tp + 365 * 200), outbound)).toBeGreaterThan(0.9999)
  })

  it("puts 1I/'Oumuamua's inbound asymptote near Vega, where it came from", () => {
    // JPL#16's elements (fixtures/smallbodies/horizons-1i.txt). The radiant published in
    // 2017 is RA 279.8°, Dec +34.0°; this computes RA 279.55°, Dec +33.90°.
    const { inbound } = asymptoteDirections({
      e: 1.201133796102373,
      q: 0.2559115812959116,
      tp: 2458006.0073213754,
      om: 24.59690955523242,
      w: 241.8105360304898,
      i: 122.7417062847286,
    })
    const eps = (23.4392911 * Math.PI) / 180
    const ye = inbound.y * Math.cos(eps) - inbound.z * Math.sin(eps)
    const ze = inbound.y * Math.sin(eps) + inbound.z * Math.cos(eps)
    const ra = ((Math.atan2(ye, inbound.x) * 180) / Math.PI + 360) % 360
    const dec = (Math.asin(ze) * 180) / Math.PI
    expect(Math.abs(ra - 279.8)).toBeLessThan(1)
    expect(Math.abs(dec - 34.0)).toBeLessThan(1)
  })

  it('has no asymptotes on an ellipse', () => {
    expect(() => asymptoteDirections(SCHAUMASSE)).toThrow(/e > 1/)
  })
})
