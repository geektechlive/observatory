import { describe, expect, it } from 'vitest'

import { robustCentreRadius } from '@/lib/orrery/craftModelFit'

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
