/**
 * The fly-in's real sky (#261): the Yale Bright Star Catalogue's stars at V <= 3.5, in ecliptic
 * J2000. Sirius (RA 6h45m, Dec -16°43') sits at ecliptic longitude 104.1°, latitude -39.6°.
 */
import { describe, expect, it } from 'vitest'

import { BRIGHT_STAR_STRIDE, BRIGHT_STARS } from '@/lib/orrery/brightStars'

const deg = (r: number) => (r * 180) / Math.PI

describe('BRIGHT_STARS (#261)', () => {
  it('holds the 287 stars at V <= 3.5, brightest first, as unit vectors', () => {
    const n = BRIGHT_STARS.length / BRIGHT_STAR_STRIDE
    expect(n).toBe(287)
    let last = -Infinity
    for (let i = 0; i < BRIGHT_STARS.length; i += BRIGHT_STAR_STRIDE) {
      const [x = 0, y = 0, z = 0, v = 0] = BRIGHT_STARS.slice(i, i + 4)
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 3)
      expect(v).toBeLessThanOrEqual(3.5)
      expect(v).toBeGreaterThanOrEqual(last)
      last = v
    }
  })

  it('puts Sirius first, where it is', () => {
    const [x = 0, y = 0, z = 0, v = 0, bv = 0] = BRIGHT_STARS.slice(0, 5)
    expect(v).toBe(-1.46)
    expect(bv).toBe(0)
    expect(deg(Math.asin(z))).toBeCloseTo(-39.6, 1)
    expect(deg(Math.atan2(y, x))).toBeCloseTo(104.1, 1)
  })
})
