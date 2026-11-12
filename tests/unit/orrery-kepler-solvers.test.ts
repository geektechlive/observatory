/**
 * One Kepler solver for every orbit shape (#99 item 1, spec Parts 5 and 17). The planets
 * (kepler.ts) and the comets and interstellar objects (conic.ts) share it: conic.ts holds
 * it because the refresh job imports that file, and kepler.ts re-exports it.
 *
 * - Elliptic: M = E - e sin E, Newton from E0 = M below e = 0.8, else π.
 * - Hyperbolic: M = e sinh H - H.
 * - Parabolic: Barker's equation, W = D + D³/3 with D = tan(ν/2).
 *
 * Near e = 1 the orbit is solved as the ellipse or hyperbola it is, with the equation
 * and the position written so nothing cancels; only e = 1 exactly takes Barker's
 * equation. So the answer slides smoothly into the parabola from either side.
 */
import { describe, expect, it } from 'vitest'

import { conicPosition } from '@/lib/orrery/conic'
import {
  solveBarker,
  solveEllipticAnomaly,
  solveHyperbolicAnomaly,
  solveKepler,
} from '@/lib/orrery/kepler'

const DEG = 180 / Math.PI

// The mean anomaly from an anomaly, written without cancellation near the origin, so a
// round trip is judged on the anomaly's own digits.
const xMinusSin = (x: number) => {
  if (Math.abs(x) >= 1) return x - Math.sin(x)
  let term = x
  let sum = 0
  for (let k = 1; k < 30; k += 1) {
    term *= (-x * x) / (2 * k * (2 * k + 1))
    sum -= term
  }
  return sum
}
const sinhMinusX = (x: number) => {
  if (Math.abs(x) >= 1) return Math.sinh(x) - x
  let term = x
  let sum = 0
  for (let k = 1; k < 30; k += 1) {
    term *= (x * x) / (2 * k * (2 * k + 1))
    sum += term
  }
  return sum
}
const ellipticM = (E: number, e: number) => (1 - e) * Math.sin(E) + xMinusSin(E)
const hyperbolicM = (H: number, e: number) => (e - 1) * Math.sinh(H) + sinhMinusX(H)

const relErr = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-300)

describe('kepler.ts shares the one solver', () => {
  it('exposes the hyperbolic and parabolic solvers next to the elliptic one', () => {
    expect(solveHyperbolicAnomaly(5, 1.2)).toBeCloseTo(
      Math.asinh((5 + solveHyperbolicAnomaly(5, 1.2)) / 1.2),
      12,
    )
    expect(solveBarker(4 / 3)).toBeCloseTo(1, 12)
  })

  it("solves the planets' equation with the same elliptic solver, in degrees", () => {
    for (const [M, e] of [
      [42, 0.2],
      [-179, 0.0934],
      [3.5, 0.2056],
      [180, 0.0167],
    ] as const) {
      expect(solveKepler(M, e)).toBe(solveEllipticAnomaly(M / DEG, e) * DEG)
    }
  })
})

describe('elliptic: M → E → M', () => {
  const es = [0, 0.0167, 0.2, 0.5, 0.79, 0.8, 0.95, 0.999, 1 - 1e-6, 1 - 1e-10]
  const Es = [-3.1, -1, -0.2, -1e-3, -1e-6, 1e-8, 0.3, 1.5, 3.1]

  it.each(es)('returns the anomaly it started from, e = %d', (e) => {
    for (const E of Es) {
      const back = solveEllipticAnomaly(ellipticM(E, e), e)
      expect(relErr(back, E)).toBeLessThan(1e-12)
    }
  })

  it('gives 0 for M = 0 and ±π for M = ±π, at any e', () => {
    for (const e of [0, 0.5, 0.9, 0.999999]) {
      expect(solveEllipticAnomaly(0, e)).toBe(0)
      expect(solveEllipticAnomaly(Math.PI, e)).toBeCloseTo(Math.PI, 12)
      expect(solveEllipticAnomaly(-Math.PI, e)).toBeCloseTo(-Math.PI, 12)
    }
  })

  it('is E = M on a circle', () => {
    for (const M of [-2, 0.4, 3]) expect(solveEllipticAnomaly(M, 0)).toBeCloseTo(M, 14)
  })

  it('keeps whole turns: M + 2πk gives E + 2πk', () => {
    const E = solveEllipticAnomaly(1, 0.6)
    expect(solveEllipticAnomaly(1 + 6 * Math.PI, 0.6)).toBeCloseTo(E + 6 * Math.PI, 11)
    expect(solveEllipticAnomaly(1 - 4 * Math.PI, 0.6)).toBeCloseTo(E - 4 * Math.PI, 11)
  })
})

describe('hyperbolic: M → H → M', () => {
  const es = [1 + 1e-10, 1 + 1e-6, 1.0022, 1.2011, 2, 3.3565, 6.1235, 50]
  const Hs = [-8, -2, -0.1, -1e-4, 1e-7, 0.05, 1, 4, 10]

  it.each(es)('returns the anomaly it started from, e = %d', (e) => {
    for (const H of Hs) {
      const back = solveHyperbolicAnomaly(hyperbolicM(H, e), e)
      expect(relErr(back, H)).toBeLessThan(1e-12)
    }
  })

  it('gives 0 for M = 0, and is odd in M', () => {
    expect(solveHyperbolicAnomaly(0, 1.5)).toBe(0)
    expect(solveHyperbolicAnomaly(-7, 3)).toBe(-solveHyperbolicAnomaly(7, 3))
  })

  it('converges for M far out on either leg', () => {
    for (const M of [1e3, -1e6, 1e9]) {
      const H = solveHyperbolicAnomaly(M, 1.2)
      expect(relErr(1.2 * Math.sinh(H) - H, M)).toBeLessThan(1e-12)
    }
  })
})

describe("parabolic: Barker's equation W → D → W", () => {
  it('returns D for W = D + D³/3, across sizes and signs', () => {
    for (const D of [-1e4, -12, -0.3, -1e-9, 0, 1e-12, 0.01, 1, 2, 50, 1e5]) {
      const W = D + D ** 3 / 3
      const back = solveBarker(W)
      expect(D === 0 ? back : relErr(back, D)).toBeLessThan(1e-12)
    }
  })
})

describe('near e = 1', () => {
  const base = { q: 0.5, tp: 2461000, om: 40, w: 100, i: 30 }
  const at = (e: number, dt: number) => conicPosition({ ...base, e }, base.tp + dt)
  const gap = (e: number, dt: number) => {
    const p = at(e, dt)
    const par = at(1, dt)
    return Math.hypot(p.x - par.x, p.y - par.y, p.z - par.z)
  }

  // The orbits on e = 1 ± δ really part from the parabola by about δ times a size that
  // depends only on the date, so gap / δ must stay put as δ shrinks. A solver that loses
  // digits near e = 1 shows as gap / δ wandering off; a parabolic band shows as zero.
  it.each([-200, -5, 3, 90, 2000])(
    'slides smoothly into the parabola from both sides, %d days from perihelion',
    (dt) => {
      const reference = gap(1 + 1e-5, dt) / 1e-5
      for (const delta of [1e-6, 1e-8, 2e-9, 1.1e-9, 1e-10, 1e-12]) {
        expect(relErr(gap(1 + delta, dt) / delta, reference)).toBeLessThan(0.02)
        expect(relErr(gap(1 - delta, dt) / delta, reference)).toBeLessThan(0.02)
      }
    },
  )

  it('gives a distance r that agrees with the position, on both sides', () => {
    for (const e of [1 - 1e-9, 1 - 1e-4, 1 + 1e-4, 1 + 1e-9]) {
      for (const dt of [-400, -1, 0.5, 60, 5000]) {
        const p = at(e, dt)
        expect(relErr(Math.hypot(p.x, p.y, p.z), p.r)).toBeLessThan(1e-12)
      }
    }
  })

  it('solves the equations themselves for tiny M close to e = 1', () => {
    for (const delta of [1e-4, 1e-8, 1e-12, 1e-15]) {
      for (const M of [1e-20, 1e-12, 1e-6, 0.3]) {
        const E = solveEllipticAnomaly(M, 1 - delta)
        expect(relErr(ellipticM(E, 1 - delta), M)).toBeLessThan(1e-12)
        const H = solveHyperbolicAnomaly(M, 1 + delta)
        expect(relErr(hyperbolicM(H, 1 + delta), M)).toBeLessThan(1e-12)
      }
    }
  })
})
