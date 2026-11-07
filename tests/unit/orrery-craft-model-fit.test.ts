import { describe, expect, it } from 'vitest'

import { robustCentreRadius, threeQuarterView } from '@/lib/orrery/craftModelFit'

describe('threeQuarterView (#115)', () => {
  const dot = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
    a.x * b.x + a.y * b.y + a.z * b.z

  it('looks at the face the attitude axis points to, from the side and above', () => {
    for (const facing of [
      { x: 1, y: 0, z: 0 },
      { x: 0, y: 0, z: -1 },
      { x: 0.6, y: 0, z: 0.8 },
      { x: 0, y: 1, z: 0 }, // straight up: the side is chosen another way
    ]) {
      const v = threeQuarterView(facing)
      expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(1, 9)
      // In front of the face, but well off its axis, so its shape shows.
      expect(dot(v, facing)).toBeGreaterThan(0.2)
      expect(dot(v, facing)).toBeLessThan(0.8)
    }
    expect(threeQuarterView({ x: 1, y: 0, z: 0 }).y).toBeGreaterThan(0)
  })
})

/** A unit cube's 8 corners centred on (cx, cy, cz), flat xyz. */
function cube(cx: number, cy: number, cz: number, half = 1): number[] {
  const out: number[] = []
  for (const x of [-half, half])
    for (const y of [-half, half]) for (const z of [-half, half]) out.push(cx + x, cy + y, cz + z)
  return out
}

describe('robustCentreRadius (#115)', () => {
  it('finds the centre and radius of a plain body', () => {
    const fit = robustCentreRadius(cube(5, -2, 3))
    expect(fit.centre.x).toBeCloseTo(5)
    expect(fit.centre.y).toBeCloseTo(-2)
    expect(fit.centre.z).toBeCloseTo(3)
    expect(fit.radius).toBeCloseTo(Math.sqrt(3))
  })

  it('ignores a long thin boom, as ACE and Wind carry, instead of shrinking the body to a speck', () => {
    // 20 copies of the body's corners, plus a boom tip 500 units out.
    const body = Array.from({ length: 20 }, () => cube(0, 0, 0)).flat()
    const fit = robustCentreRadius([...body, 500, 0, 0, 501, 0, 0])
    expect(fit.radius).toBeLessThan(2)
    expect(Math.abs(fit.centre.x)).toBeLessThan(0.5)
  })

  it('never returns a zero radius', () => {
    expect(robustCentreRadius([1, 1, 1]).radius).toBeGreaterThan(0)
    expect(robustCentreRadius([]).radius).toBeGreaterThan(0)
  })
})
