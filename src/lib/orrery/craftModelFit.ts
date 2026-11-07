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
