/**
 * Pixel ceilings (#195): a share-of-Earth marker grows with Earth, so it must stop at a
 * px size under the Sun's floor or a big window shows a Moon larger than the Sun.
 */
import { describe, expect, it } from 'vitest'

import { clampRadius, PX_CEILING } from '@/components/orrery/three/pxClamp'

describe('clampRadius', () => {
  it('leaves a radius between the floor and the ceiling alone', () => {
    expect(clampRadius(5, 1, 2, 8)).toBe(5)
  })

  it('raises a radius under the floor to floor px', () => {
    expect(clampRadius(0.5, 2, 2, 8)).toBe(4)
  })

  it('cuts a radius over the ceiling to ceiling px', () => {
    expect(clampRadius(100, 0.5, 2, 8)).toBe(4)
  })

  it('lets the ceiling win when the floor sits above it', () => {
    expect(clampRadius(1, 1, 9, 5)).toBe(5)
  })

  it('skips the ceiling when none is given', () => {
    expect(clampRadius(100, 1, 2)).toBe(100)
  })
})

describe('PX_CEILING', () => {
  const SUN_FLOOR_PX = 10
  it.each(Object.entries(PX_CEILING))('%s stays under the Sun’s floor radius', (_name, px) => {
    expect(px).toBeLessThan(SUN_FLOOR_PX)
  })
})
