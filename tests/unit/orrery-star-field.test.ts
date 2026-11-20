/**
 * The real stars (#261), drawn by the orrery at true scale in the fly-in (#268): every catalogue
 * star once, on a sphere round the camera, tinted by colour index, faded with the ease.
 */
import type { Points, PointsMaterial } from 'three'
import { describe, expect, it } from 'vitest'

import { buildStars, setStarsOpacity, starColour } from '@/components/orrery/three/starField'
import { BRIGHT_STAR_STRIDE, BRIGHT_STARS } from '@/lib/orrery/brightStars'

describe('the star field', () => {
  it('draws every catalogue star once, on a sphere of the given radius', () => {
    const stars = buildStars(1e5)
    const count = stars.children.reduce(
      (n, p) => n + (p as Points).geometry.getAttribute('position').count,
      0,
    )
    expect(count).toBe(BRIGHT_STARS.length / BRIGHT_STAR_STRIDE)
    const first = (stars.children[0] as Points).geometry.getAttribute('position')
    // The vectors are stored to 4 decimals, so the sphere is true to about 1 part in 10^4.
    expect(Math.hypot(first.getX(0), first.getY(0), first.getZ(0)) / 1e5).toBeCloseTo(1, 4)
  })

  it('tints stars by colour index and dims fainter ones', () => {
    const blue = starColour(-0.2, 1)
    const red = starColour(1.6, 1)
    expect(blue.b).toBeGreaterThan(blue.r)
    expect(red.r).toBeGreaterThan(red.b)
    expect(starColour(0.6, 3).r).toBeLessThan(starColour(0.6, 0).r)
  })

  it('fades with the ease, and is hidden at none', () => {
    const stars = buildStars(1)
    setStarsOpacity(stars, 0.4)
    expect(stars.visible).toBe(true)
    expect(((stars.children[0] as Points).material as PointsMaterial).opacity).toBe(0.4)
    setStarsOpacity(stars, 0)
    expect(stars.visible).toBe(false)
  })
})
