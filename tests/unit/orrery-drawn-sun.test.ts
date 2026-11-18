/**
 * The Sun is drawn larger than life in the stretched scales, so a craft that dives close
 * (Parker Solar Probe) has its path inside the drawn Sun. The inspector says so (#261,
 * the owner's option C, 2026-11-17).
 */
import { describe, expect, it } from 'vitest'

import { closestPassAu, drawnSunAu, insideDrawnSun } from '@/lib/orrery/drawnSun'
import { place3d } from '@/lib/orrery/scale'

const SUN_RADIUS_AU = 695_700 / 149_597_870.7

describe('drawnSunAu', () => {
  it('is the distance whose place3d radius is the Sun as drawn in Big bodies', () => {
    const au = drawnSunAu('exaggerated')
    expect(au).not.toBeNull()
    expect(Math.hypot(...Object.values(place3d({ x: au ?? 0, y: 0, z: 0 })))).toBeCloseTo(0.22, 9)
    expect(au).toBeGreaterThan(0.15)
    expect(au).toBeLessThan(0.16)
  })

  it('is smaller in Log distance, where bodies are drawn at 0.45 of Big bodies', () => {
    const au = drawnSunAu('log') ?? 0
    expect(Math.hypot(...Object.values(place3d({ x: au, y: 0, z: 0 })))).toBeCloseTo(0.099, 9)
  })

  it('is null in Proportional, where the Sun is its true size', () => {
    expect(drawnSunAu('proportional')).toBeNull()
  })
})

describe('closestPassAu', () => {
  it('is the smallest distance from the Sun along the points', () => {
    expect(
      closestPassAu([
        { x: 0.7, y: 0, z: 0 },
        { x: 0, y: 0.046, z: 0 },
        { x: -0.3, y: 0.1, z: 0.01 },
      ]),
    ).toBeCloseTo(0.046, 12)
  })

  it('is null with no points', () => {
    expect(closestPassAu([])).toBeNull()
  })
})

describe('insideDrawnSun', () => {
  it('is true for Parker (9.86 solar radii) in both stretched scales', () => {
    const parker = 9.86 * SUN_RADIUS_AU
    expect(insideDrawnSun(parker, 'exaggerated')).toBe(true)
    expect(insideDrawnSun(parker, 'log')).toBe(true)
    expect(insideDrawnSun(parker, 'proportional')).toBe(false)
  })

  it('is false for Solar Orbiter (0.28 au) and for no data', () => {
    expect(insideDrawnSun(0.28, 'exaggerated')).toBe(false)
    expect(insideDrawnSun(null, 'exaggerated')).toBe(false)
  })
})
