/**
 * How a spacecraft model is centred and sized on screen (#115). NASA's models carry long
 * wire booms (ACE's bounding box is 921 x 278 x 1345 units around a small drum), so a
 * bounding box would shrink the craft body to a speck. The centre is, per axis, the
 * midpoint of the vertices' 10th and 90th percentiles, and the radius their
 * 90th-percentile distance from it.
 */
export interface ModelFit {
  centre: { x: number; y: number; z: number }
  radius: number
}

const RADIUS_PERCENTILE = 0.9
const TRIM = 0.1

/** Midpoint of a set's 10th and 90th percentiles: symmetric bodies centre exactly, booms don't pull. */
function trimmedMid(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const lo = sorted[Math.floor((sorted.length - 1) * TRIM)] ?? 0
  const hi = sorted[Math.ceil((sorted.length - 1) * (1 - TRIM))] ?? 0
  return (lo + hi) / 2
}

interface V3 {
  x: number
  y: number
  z: number
}

const norm = (v: V3): V3 => {
  const n = Math.hypot(v.x, v.y, v.z) || 1
  return { x: v.x / n, y: v.y / n, z: v.z / n }
}

/**
 * Where the camera looks at a focused craft model from, scene space (+y up): in front of
 * the face its attitude axis points to (Voyager's dish, Parker's shield), but from the
 * side and a little above, so its shape reads. Head-on, a dish is a disc; edge-on,
 * Psyche's arrays vanish (both seen on the first #115 renders).
 */
export function threeQuarterView(facing: V3): V3 {
  const f = norm(facing)
  // The side: perpendicular to the facing in the horizontal plane, or along x when the
  // facing is vertical.
  const side = Math.abs(f.y) > 0.95 ? { x: 1, y: 0, z: 0 } : norm({ x: -f.z, y: 0, z: f.x })
  // A little lift, less as the facing turns vertical (it would only add to the facing).
  const lift = 0.45 * (1 - Math.abs(f.y))
  return norm({
    x: f.x * 0.55 + side.x * 0.7,
    y: f.y * 0.55 + side.y * 0.7 + lift,
    z: f.z * 0.55 + side.z * 0.7,
  })
}

/** Centre and robust radius of flat xyz positions; the radius is never zero. */
export function robustCentreRadius(positions: readonly number[]): ModelFit {
  const xs: number[] = []
  const ys: number[] = []
  const zs: number[] = []
  for (let i = 0; i + 2 < positions.length; i += 3) {
    xs.push(positions[i] ?? 0)
    ys.push(positions[i + 1] ?? 0)
    zs.push(positions[i + 2] ?? 0)
  }
  const centre = { x: trimmedMid(xs), y: trimmedMid(ys), z: trimmedMid(zs) }
  const distances = xs
    .map((x, i) => Math.hypot(x - centre.x, (ys[i] ?? 0) - centre.y, (zs[i] ?? 0) - centre.z))
    .sort((a, b) => a - b)
  const r =
    distances[Math.min(distances.length - 1, Math.floor(distances.length * RADIUS_PERCENTILE))] ?? 0
  return { centre, radius: r > 0 ? r : 1 }
}
