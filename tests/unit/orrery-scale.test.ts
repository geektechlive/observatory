/**
 * The orrery's two views (#90): SYSTEM, a square-root scale that keeps Mercury readable
 * beside Neptune, and INNER, a linear scale where eccentricity reads true. A body outside
 * the frame sits on its rim, in its true direction, labelled with its true distance.
 */
import { describe, expect, it } from 'vitest'

import { linearScale, place, sqrtScale } from '@/lib/orrery'

describe('sqrtScale (#90)', () => {
  it('maps the Sun to the centre and the frame edge to the radius', () => {
    expect(sqrtScale(0, 32, 300)).toBe(0)
    expect(sqrtScale(32, 32, 300)).toBeCloseTo(300, 9)
  })

  it('keeps order, and gives the inner planets room', () => {
    const r = [0.39, 0.72, 1, 1.52, 5.2, 9.5, 19.2, 30.1].map((au) => sqrtScale(au, 32, 300))
    for (let i = 1; i < r.length; i += 1) expect(r[i]).toBeGreaterThan(r[i - 1] ?? Infinity)
    // Linear would put Mercury 3.7 px from the Sun; the square root gives it ~33 px.
    expect(r[0]).toBeGreaterThan(30)
  })
})

describe('linearScale (#90)', () => {
  it('is proportional to distance', () => {
    expect(linearScale(0.85, 1.7, 300)).toBeCloseTo(150, 9)
  })
})

describe('place (#90)', () => {
  it('keeps a body inside the frame at its scaled distance, in its true direction', () => {
    const p = place({ x: 0, y: 1, z: 0 }, linearScale, 1.7, 340)
    expect(p.onRim).toBe(false)
    expect(p.x).toBeCloseTo(0, 9)
    expect(p.y).toBeCloseTo(200, 9)
    expect(p.distanceAu).toBeCloseTo(1, 9)
  })

  it('puts a body beyond the frame on the rim, at atan2(y, x), with its true 3D distance', () => {
    // Voyager 1, roughly: far beyond Neptune and well above the ecliptic.
    const v = { x: -30, y: -120, z: 99 }
    const p = place(v, sqrtScale, 32, 300)
    expect(p.onRim).toBe(true)
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(300, 9)
    expect(Math.atan2(p.y, p.x)).toBeCloseTo(Math.atan2(v.y, v.x), 9)
    expect(p.distanceAu).toBeCloseTo(Math.hypot(-30, -120, 99), 9)
  })

  it('returns a new object and leaves the input alone', () => {
    const v = { x: 1, y: 2, z: 3 }
    const p = place(v, linearScale, 10, 100)
    expect(p).not.toBe(v)
    expect(v).toEqual({ x: 1, y: 2, z: 3 })
  })
})
