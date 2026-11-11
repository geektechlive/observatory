import { describe, expect, it } from 'vitest'

import { outlineFraming, type Point3 } from '@/lib/orrery/detailFraming'

const FOV = 35
const MARGIN = 0.08
const DIRECTION = { x: 0.55, y: 0.32, z: 0.77 }

/**
 * Where a camera at `centre + direction * distance`, looking at `centre`, sees `points`: the
 * largest absolute normalised device coordinate across and up. Camera axes are three.js's
 * `lookAt` with world up (0, 1, 0).
 */
function projectedExtent(
  points: readonly number[],
  centre: Point3,
  direction: Point3,
  distance: number,
  aspect: number,
): { fill: number; maxX: number; maxY: number; sideX: [number, number] } {
  const len = Math.hypot(direction.x, direction.y, direction.z)
  const z = { x: direction.x / len, y: direction.y / len, z: direction.z / len }
  const xl = Math.hypot(z.z, z.x)
  const x = { x: z.z / xl, y: 0, z: -z.x / xl }
  const y = { x: z.y * x.z - z.z * x.y, y: z.z * x.x - z.x * x.z, z: z.x * x.y - z.y * x.x }
  const tanV = Math.tan((FOV * Math.PI) / 360)
  let maxX = 0
  let maxY = 0
  let leftX = 0
  let rightX = 0
  for (let i = 0; i < points.length; i += 3) {
    const px = (points[i] ?? 0) - centre.x
    const py = (points[i + 1] ?? 0) - centre.y
    const pz = (points[i + 2] ?? 0) - centre.z
    const depth = distance - (px * z.x + py * z.y + pz * z.z)
    const nx = (px * x.x + py * x.y + pz * x.z) / (depth * tanV * aspect)
    leftX = Math.min(leftX, nx)
    rightX = Math.max(rightX, nx)
    maxX = Math.max(maxX, Math.abs(nx))
    maxY = Math.max(maxY, Math.abs(px * y.x + py * y.y + pz * y.z) / (depth * tanV))
  }
  return { fill: Math.max(maxX, maxY), maxX, maxY, sideX: [leftX, rightX] }
}

// A long thin body with wide arrays, off-centre: the shape a bounding sphere wastes room on.
const CLOUD = [
  ...[-14, -1, -1],
  ...[-14, 1, 1],
  ...[6, -1, 1],
  ...[6, 1, -1],
  ...[0, -0.5, 5],
  ...[0, 0.5, -5],
  ...[3, 7, 0],
  ...[3, -7, 0],
]

describe('outlineFraming', () => {
  it.each([0.5, 1, 1.6, 2.4])(
    'fills the limiting canvas dimension to 1 over (1 + margin) at aspect %f',
    (aspect) => {
      const f = outlineFraming(CLOUD, DIRECTION, FOV, aspect, MARGIN)
      const { fill } = projectedExtent(CLOUD, f.centre, DIRECTION, f.distance, aspect)
      expect(fill).toBeCloseTo(1 / (1 + MARGIN), 4)
    },
  )

  it('fills well over 60% of the limiting dimension and keeps every vertex in frame', () => {
    const f = outlineFraming(CLOUD, DIRECTION, FOV, 1.4, MARGIN)
    const { fill, maxX, maxY } = projectedExtent(CLOUD, f.centre, DIRECTION, f.distance, 1.4)
    expect(fill).toBeGreaterThan(0.6)
    expect(maxX).toBeLessThanOrEqual(1)
    expect(maxY).toBeLessThanOrEqual(1)
  })

  it('balances the picture across the canvas even when perspective enlarges the near side', () => {
    // A wide model whose right end is much nearer the camera than its left.
    const lopsided = [-4, 0, -6, -4, 1, -6, 4, 0, 6, 4, 1, 6, 0, 0, 0]
    const f = outlineFraming(lopsided, { x: 1, y: 0, z: 0.3 }, FOV, 1.4, MARGIN)
    const { sideX } = projectedExtent(lopsided, f.centre, { x: 1, y: 0, z: 0.3 }, f.distance, 1.4)
    expect(Math.abs(sideX[0] + sideX[1])).toBeLessThan(0.01)
  })

  it('follows the model: moved 2 units, the centre moves with it and the distance is the same', () => {
    const f = outlineFraming(CLOUD, DIRECTION, FOV, 1.4, MARGIN)
    const shifted = outlineFraming(
      CLOUD.map((v, i) => (i % 3 === 0 ? v - 2 : v)),
      DIRECTION,
      FOV,
      1.4,
      MARGIN,
    )
    expect(shifted.centre.x).toBeCloseTo(f.centre.x - 2, 6)
    expect(shifted.distance).toBeCloseTo(f.distance, 6)
  })

  it('backs off for a vertex near the camera: perspective, not just width', () => {
    // Two vertices across, one toward the camera: still exactly filled, none outside.
    const deep = [-3, 0, 0, 3, 0, 0, 0, 0, 1]
    const front = { x: 0, y: 0, z: 1 }
    const f = outlineFraming(deep, front, FOV, 1, MARGIN)
    const { fill } = projectedExtent(deep, f.centre, front, f.distance, 1)
    expect(fill).toBeCloseTo(1 / (1 + MARGIN), 4)
  })

  it('reports a radius that holds every vertex about the new centre', () => {
    const f = outlineFraming(CLOUD, DIRECTION, FOV, 1, MARGIN)
    for (let i = 0; i < CLOUD.length; i += 3) {
      const d = Math.hypot(
        (CLOUD[i] ?? 0) - f.centre.x,
        (CLOUD[i + 1] ?? 0) - f.centre.y,
        (CLOUD[i + 2] ?? 0) - f.centre.z,
      )
      expect(d).toBeLessThanOrEqual(f.radius + 1e-9)
    }
  })

  it('lets the zoom run in to 0.36 of the fit (not into the sphere) and out to where the sphere is whole', () => {
    const f = outlineFraming(CLOUD, DIRECTION, FOV, 1.4, MARGIN)
    expect(f.minDistance).toBeCloseTo(Math.max(f.distance * 0.36, f.radius * 1.1), 6)
    expect(f.maxDistance).toBeGreaterThanOrEqual(f.distance * 3.3)
    // Turned to any side, the model is inside its sphere: at the limit that sphere is in view.
    const half = Math.min((FOV * Math.PI) / 360, Math.atan(Math.tan((FOV * Math.PI) / 360) * 1.4))
    expect(Math.asin((f.radius * (1 + MARGIN)) / f.maxDistance)).toBeLessThanOrEqual(half + 1e-9)
  })

  it('never lets the camera in past the bounding sphere, so no vertex is behind it', () => {
    // A pole along the view direction: the outline fit alone puts the camera at its near tip.
    const pole = [0, 0, -5, 0, 0, 5]
    const along = { x: 0, y: 0, z: 1 }
    const f = outlineFraming(pole, along, FOV, 1, MARGIN)
    expect(f.minDistance).toBeGreaterThanOrEqual(f.radius * 1.1)
    expect(f.distance).toBeGreaterThanOrEqual(f.radius * 1.2)
    expect(f.minDistance).toBeLessThan(f.distance)
    // And for an ordinary model.
    const g = outlineFraming(CLOUD, DIRECTION, FOV, 1.4, MARGIN)
    expect(g.minDistance).toBeGreaterThanOrEqual(g.radius * 1.1)
    expect(g.minDistance).toBeLessThan(g.distance)
  })

  it('reaches the whole sphere on a narrow canvas, where the sphere sets the limit', () => {
    const f = outlineFraming(CLOUD, DIRECTION, FOV, 0.4, MARGIN)
    const half = Math.atan(Math.tan((FOV * Math.PI) / 360) * 0.4)
    expect(Math.asin((f.radius * (1 + MARGIN)) / f.maxDistance)).toBeLessThanOrEqual(half + 1e-9)
  })

  it('skips vertices that are not finite instead of poisoning the fit', () => {
    const dirty = [
      ...CLOUD,
      Number.NaN,
      0,
      0,
      1,
      Number.POSITIVE_INFINITY,
      2,
      3,
      4,
      Number.NEGATIVE_INFINITY,
    ]
    const clean = outlineFraming(CLOUD, DIRECTION, FOV, 1.4, MARGIN)
    const f = outlineFraming(dirty, DIRECTION, FOV, 1.4, MARGIN)
    expect(f).toEqual(clean)
    expect(Number.isFinite(f.distance)).toBe(true)
    // Nothing but non-finite points is the same as none.
    const none = outlineFraming([Number.NaN, 1, 2], DIRECTION, FOV, 1, MARGIN)
    expect(Number.isFinite(none.distance)).toBe(true)
    expect(none.distance).toBeGreaterThan(0)
  })

  it('copes with no points and with a single point', () => {
    for (const points of [[], [1, 2, 3]]) {
      const f = outlineFraming(points, DIRECTION, FOV, 1, MARGIN)
      expect(Number.isFinite(f.distance)).toBe(true)
      expect(f.distance).toBeGreaterThan(0)
      expect(f.maxDistance).toBeGreaterThan(f.minDistance)
    }
  })
})
