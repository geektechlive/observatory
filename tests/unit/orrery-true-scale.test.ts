/**
 * The fly-in's geometry (#261). The close-up places everything at its true position in km,
 * relative to the craft, so sizes, phases and what passes in front are true from any camera.
 * These are the pure parts: positions, angular size, phase, where the flight starts (never
 * inside a body, never through one) and how its distance falls.
 */
import { describe, expect, it } from 'vitest'

import { MOONS } from '@/lib/orrery/moons'
import {
  angularRadius,
  BODY_RADIUS_KM,
  flightDistanceKm,
  flightStart,
  framingApproach,
  type Km3,
  modelMetresPerUnit,
  phaseAngle,
  relativeKm,
} from '@/lib/orrery/trueScale'
import { AU_KM } from '@/lib/orrery/units'

const len = (v: Km3) => Math.hypot(v[0], v[1], v[2])
const deg = (r: number) => (r * 180) / Math.PI

describe('relativeKm', () => {
  it('is the body minus the craft, in km', () => {
    const v = relativeKm({ x: 1, y: 0, z: 0 }, { x: 0.99, y: 0, z: 0 })
    expect(v[0]).toBeCloseTo(0.01 * AU_KM, 3)
    expect(v[1]).toBe(0)
  })
})

describe('angularRadius', () => {
  it('gives the Sun about 5.8° from Parker at 9.86 solar radii', () => {
    const r = BODY_RADIUS_KM.Sun
    expect(deg(angularRadius(r, 9.86 * r))).toBeCloseTo(5.82, 2)
  })

  it('gives the Sun about 0.27° from Earth', () => {
    expect(deg(angularRadius(BODY_RADIUS_KM.Sun, AU_KM))).toBeCloseTo(0.2665, 3)
  })

  it('fills the sky from inside the body', () => {
    expect(angularRadius(10, 5)).toBe(Math.PI / 2)
  })
})

describe('phaseAngle', () => {
  it('is 0 (full) with the Sun behind the camera, 180° (new) with it behind the body', () => {
    expect(phaseAngle([1, 0, 0], [1, 0, 0])).toBeCloseTo(0, 9)
    expect(deg(phaseAngle([1, 0, 0], [-1, 0, 0]))).toBeCloseTo(180, 9)
    expect(deg(phaseAngle([1, 0, 0], [0, 1, 0]))).toBeCloseTo(90, 9)
  })
})

describe('the radii are true', () => {
  it('carries the IAU nominal Sun and the mean planetary radii', () => {
    expect(BODY_RADIUS_KM.Sun).toBe(695_700)
    expect(BODY_RADIUS_KM.Jupiter).toBe(69_911)
    expect(BODY_RADIUS_KM.Earth).toBe(6_371)
  })

  it('gives every moon a radius from JPL', () => {
    for (const m of MOONS) expect(m.radiusKm, m.name).toBeGreaterThan(5)
    expect(MOONS.find((m) => m.name === 'Io')?.radiusKm).toBe(1_821.49)
    expect(MOONS.find((m) => m.name === 'Titan')?.radiusKm).toBe(2_574.76)
  })
})

describe('flightStart', () => {
  const sunR = BODY_RADIUS_KM.Sun

  it('starts on the asked-for side when nothing is in the way', () => {
    const s = flightStart([0, 0, 1], 1e6, [])
    expect(s).toEqual([0, 0, 1e6])
  })

  it('never starts with the Sun between the camera and Parker', () => {
    // Parker at 9.86 solar radii, the Sun along +x; the visitor came in from the Sun's side.
    const sun = { center: [9.86 * sunR, 0, 0] as Km3, radiusKm: sunR }
    const s = flightStart([1, 0, 0], 1e7, [sun])
    // Clear: the straight line in to the craft misses the Sun with room to spare.
    expect(segmentMisses(s, sun.center, sun.radiusKm * 1.05)).toBe(true)
    expect(len(s)).toBeCloseTo(1e7, 0)
  })

  it('never starts inside a body', () => {
    // Juno 4,000 km above Jupiter's cloud tops, Jupiter along -y.
    const jupR = BODY_RADIUS_KM.Jupiter
    const jupiter = { center: [0, -(jupR + 4_000), 0] as Km3, radiusKm: jupR }
    const s = flightStart([0, -1, 0], 1e6, [jupiter])
    const fromJupiter = len([
      s[0] - jupiter.center[0],
      s[1] - jupiter.center[1],
      s[2] - jupiter.center[2],
    ])
    expect(fromJupiter).toBeGreaterThan(jupR)
    expect(segmentMisses(s, jupiter.center, jupR * 1.05)).toBe(true)
  })

  it('keeps as close to the asked-for direction as it can', () => {
    const sun = { center: [9.86 * sunR, 0, 0] as Km3, radiusKm: sunR }
    const s = flightStart([1, 0, 0], 1e7, [sun])
    const cos = s[0] / len(s)
    // The Sun covers about 6° seen from Parker (with the margin); the start sits just outside it.
    expect(deg(Math.acos(cos))).toBeLessThan(20)
  })
})

describe('modelMetresPerUnit', () => {
  // Measured 2026-11-17 against ESA DISCOS: scaled this way every model matched DISCOS's span
  // (Juno 22.0 of 22 m, JWST 21.2 of 21.2) or its body (Voyager's 3.7 m dish, Parker's 3 m).
  it('scales the whole model to DISCOS’s span when the span counts arrays or booms', () => {
    // Juno: a 3.5 m body, 22 m across its arrays; the model's farthest vertex at 1.4 units.
    expect(modelMetresPerUnit({ bodyM: 3.5, spanM: 22 }, 1.4)).toBeCloseTo(11 / 1.4, 9)
  })

  it('scales the body (the robust radius, 1 unit) when the span is only the body', () => {
    // Parker: 3 m tall, DISCOS span 3 m; Voyager: a 3.7 m dish, span 3.7 m.
    expect(modelMetresPerUnit({ bodyM: 3, spanM: 3 }, 2.6)).toBe(1.5)
    expect(modelMetresPerUnit({ bodyM: 3.7, spanM: null }, 1.8)).toBe(1.85)
  })
})

describe('framingApproach', () => {
  const deg2 = (a: Km3, b: Km3) =>
    deg(Math.acos((a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (len(a) * len(b))))

  it('comes in from opposite the biggest-looking body, 12° off, so it frames the craft', () => {
    // The Sun along +x (big from Parker), Venus along +y (tiny): the Sun wins.
    const bodies = [
      { relKm: [9.86 * 695_700, 0, 0] as Km3, radiusKm: 695_700 },
      { relKm: [0, 4e7, 0] as Km3, radiusKm: 6_052 },
    ]
    const a = framingApproach(bodies, [0, 0, 1])
    // About 168° from the Sun: the Sun sits 12° off the centre of the view, behind the craft.
    expect(deg2(a, [1, 0, 0])).toBeCloseTo(168, 1)
    // Turned toward where the visitor was looking from.
    expect(a[2]).toBeGreaterThan(0)
  })

  it('falls back to the visitor’s side with no bodies', () => {
    expect(framingApproach([], [0, 0, 1])).toEqual([0, 0, 1])
  })
})

describe('flightDistanceKm', () => {
  it('runs from the start to the end, falling fast then slowing as it arrives', () => {
    expect(flightDistanceKm(0, 1e6, 0.03)).toBeCloseTo(1e6, 3)
    expect(flightDistanceKm(1, 1e6, 0.03)).toBeCloseTo(0.03, 9)
    const half = flightDistanceKm(0.5, 1e6, 0.03)
    // Halfway in time is well past halfway in log distance: tens of km, not 500,000.
    expect(half).toBeGreaterThan(3)
    expect(half).toBeLessThan(100)
    let last = Infinity
    for (let s = 0; s <= 1; s += 0.05) {
      const d = flightDistanceKm(s, 1e6, 0.03)
      expect(d).toBeLessThanOrEqual(last)
      last = d
    }
  })

  it('gives the last 10 km, where the craft grows from a dot to arrival, half the flight', () => {
    // The owner saw the craft "wink into existence" (#261): with equal time per decade the
    // stretch where it resolves took under a fifth of the flight.
    let s = 0
    while (flightDistanceKm(s, 1e6, 0.03) > 10) s += 0.001
    expect(1 - s).toBeGreaterThanOrEqual(0.45)
  })

  it('clamps outside 0 to 1', () => {
    expect(flightDistanceKm(-1, 100, 1)).toBe(100)
    expect(flightDistanceKm(2, 100, 1)).toBe(1)
  })
})

/** Whether the segment from `a` to the origin stays more than `r` from `c`. */
function segmentMisses(a: Km3, c: Km3, r: number): boolean {
  const ab: Km3 = [-a[0], -a[1], -a[2]]
  const ac: Km3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
  const t = Math.max(0, Math.min(1, (ac[0] * ab[0] + ac[1] * ab[1] + ac[2] * ab[2]) / len(ab) ** 2))
  const p: Km3 = [a[0] + ab[0] * t - c[0], a[1] + ab[1] * t - c[1], a[2] + ab[2] * t - c[2]]
  return len(p) > r
}
