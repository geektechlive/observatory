/**
 * Pixel ceilings (#195): a share-of-Earth marker grows with Earth, so it must stop at a
 * px size under the Sun's floor or a big window shows a Moon larger than the Sun.
 */
import { describe, expect, it } from 'vitest'

import { clampRadius, PX_CEILING, SMALL_BODY_MIN_PX } from '@/components/orrery/three/pxClamp'

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

  it('rings the chosen satellite (#140) outside its marker, under the Sun', () => {
    // A fixed size on screen: floor and ceiling are one number.
    expect(PX_CEILING.satSelect).toBeGreaterThan(PX_CEILING.satMarker)
    expect(PX_CEILING.satSelect).toBeLessThan(SUN_FLOOR_PX)
  })

  it('holds the comet and interstellar markers (#99) between 3 and 5 px, under the Sun', () => {
    expect(SMALL_BODY_MIN_PX).toBe(3)
    expect(PX_CEILING.smallBody).toBe(5)
    expect(SMALL_BODY_MIN_PX).toBeLessThan(PX_CEILING.smallBody)
    expect(PX_CEILING.smallBody).toBeLessThan(SUN_FLOOR_PX)
    // However big the scene radius, a marker draws at the ceiling: 5 px at 0.1 units/px.
    expect(clampRadius(100, 0.1, SMALL_BODY_MIN_PX, PX_CEILING.smallBody)).toBeCloseTo(0.5, 9)
    // However small, at the floor: 3 px.
    expect(clampRadius(0, 0.1, SMALL_BODY_MIN_PX, PX_CEILING.smallBody)).toBeCloseTo(0.3, 9)
  })
})
