import { describe, expect, it } from 'vitest'

import { circlePath, project, projectMany } from '@/components/globe/useGlobeProjection'

const R = 100
const SQRT_HALF = Math.SQRT1_2 // cos(45°) = sin(45°) ≈ 0.7071

describe('project', () => {
  it('places lat 0 / lon 0 at the sphere center at rotation 0', () => {
    const p = project(0, 0, 0, R)

    expect(p.x).toBeCloseTo(0, 6)
    expect(p.y).toBeCloseTo(0, 6)
    expect(p.z).toBeCloseTo(1, 6)
    expect(p.visible).toBe(true)
  })

  it('places lon 45 east at +0.7071R on the x axis', () => {
    const p = project(0, 45, 0, R)

    expect(p.x).toBeCloseTo(R * SQRT_HALF, 6)
    expect(p.y).toBeCloseTo(0, 6)
    expect(p.visible).toBe(true)
  })

  it('inverts latitude on the y axis so north is up', () => {
    const p = project(45, 0, 0, R)

    expect(p.x).toBeCloseTo(0, 6)
    expect(p.y).toBeCloseTo(-R * SQRT_HALF, 6)
    expect(p.visible).toBe(true)
  })

  it('hides the prime meridian once the globe has spun 180 degrees', () => {
    const p = project(0, 0, 180, R)

    expect(p.z).toBeCloseTo(-1, 6)
    expect(p.visible).toBe(false)
  })

  it('hides points just past the limb', () => {
    const onLimb = project(0, 90, 0, R)
    const pastLimb = project(0, 91, 0, R)

    // cos(90°) is a positive float epsilon, so the exact limb still counts as
    // front-side; one degree further round is unambiguously behind.
    expect(onLimb.x).toBeCloseTo(R, 6)
    expect(pastLimb.z).toBeLessThan(0)
    expect(pastLimb.visible).toBe(false)
  })
})

describe('projectMany', () => {
  const points = [
    { lat: 0, lon: 0, id: 'origin' },
    { lat: 0, lon: 180, id: 'antipode' },
    { lat: 45, lon: 0, id: 'north' },
  ]

  it('keeps only front-side points and preserves their source index', () => {
    const out = projectMany(points, 0, R)

    expect(out.map((m) => m.point.id)).toEqual(['origin', 'north'])
    expect(out.map((m) => m.index)).toEqual([0, 2])
    expect(out.every((m) => m.visible)).toBe(true)
  })

  it('projects the same coordinates as project()', () => {
    const [first] = projectMany(points, 0, R)

    expect(first?.x).toBeCloseTo(project(0, 0, 0, R).x, 6)
    expect(first?.y).toBeCloseTo(project(0, 0, 0, R).y, 6)
  })

  it('drops a point once rotation carries it to the far hemisphere', () => {
    const out = projectMany([{ lat: 0, lon: 0 }], 180, R)

    expect(out).toHaveLength(0)
  })

  it('swaps which points are visible as the globe rotates', () => {
    const out = projectMany(points, 180, R)

    expect(out.map((m) => m.point.id)).toEqual(['antipode'])
    expect(out[0]?.index).toBe(1)
  })

  it('returns an empty array for an empty layer', () => {
    expect(projectMany([], 0, R)).toEqual([])
  })
})

describe('circlePath', () => {
  it('emits a closed two-arc circle that can be concatenated', () => {
    const d = circlePath(10, 20, 2)

    expect(d).toBe('M8.0,20.0a2,2 0 1,0 4,0a2,2 0 1,0 -4,0')
    expect(`${d}${d}`.startsWith(d)).toBe(true)
  })
})
