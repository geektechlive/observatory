/**
 * How the "Look closer" view frames a model (#205). The orrery's small model is fitted by a
 * robust body radius that leaves booms and arrays out on purpose; a close-up must show all of
 * it, so this works from the model's real outline: every vertex. Pure: no three.js types, so it
 * is unit-tested alone and the scene feeds it the model's vertices.
 */

export interface Point3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface OutlineFraming {
  /** The point to look at: the middle of the model's projected outline, not of its box. */
  readonly centre: Point3
  /** Camera distance from `centre`, along the view direction, that fills the canvas. */
  readonly distance: number
  /** Distance from `centre` to the furthest vertex: a sphere that holds the whole model. */
  readonly radius: number
  /** Closest the camera may come. */
  readonly minDistance: number
  /**
   * Furthest the camera may go: at least where the whole bounding sphere is in view, so the
   * whole model is reachable from any side, and at least a few times the fitting distance.
   */
  readonly maxDistance: number
}

/** Zoom in as far as this share of the fitting distance. */
export const ZOOM_IN_LIMIT = 0.36
/** Zoom out to at least this many times the fitting distance. */
export const ZOOM_OUT_LIMIT = 3.3
/** The closest approach, in radii of the bounding sphere: outside it by a tenth. */
export const SPHERE_CLEARANCE = 1.1
/** The fitting distance is at least this many radii, so it is always past the closest approach. */
const START_CLEARANCE = 1.2
/** Smallest radius treated as real, so an empty model still gives a finite camera. */
const MIN_RADIUS = 1e-3
/** Rounds spent balancing the outline in the canvas; a few settle to well under a pixel. */
const BALANCE_PASSES = 6

/** The vertices whose three coordinates are all finite, as a flat list (a bad one is skipped). */
function finitePoints(points: ArrayLike<number>): number[] {
  const out: number[] = []
  for (let i = 0; i + 2 < points.length; i += 3) {
    const px = points[i] ?? Number.NaN
    const py = points[i + 1] ?? Number.NaN
    const pz = points[i + 2] ?? Number.NaN
    if (Number.isFinite(px) && Number.isFinite(py) && Number.isFinite(pz)) out.push(px, py, pz)
  }
  return out
}

/** Half-angles of the vertical and horizontal fields of view, in radians. */
function halfFields(fovDeg: number, aspect: number): { v: number; h: number } {
  const v = (fovDeg * Math.PI) / 360
  return { v, h: Math.atan(Math.tan(v) * Math.max(aspect, 1e-3)) }
}

/**
 * Frame a model by its real outline (#205). A bounding sphere is safe from any side but wastes
 * room on a long or flat model; this fits the vertices themselves, as seen from `direction`
 * (from the model toward the camera), so the outline fills the canvas in its limiting
 * dimension with `margin` to spare (0.08 leaves 8%). World up is +y, as in three.js's `lookAt`.
 * `points` is a flat x, y, z list. Exact for that direction, perspective included: a vertex
 * nearer the camera needs more distance. `aspect` is canvas width over height.
 */
export function outlineFraming(
  allPoints: ArrayLike<number>,
  direction: Point3,
  fovDeg: number,
  aspect: number,
  margin: number,
): OutlineFraming {
  const points = finitePoints(allPoints)
  const count = Math.floor(points.length / 3)
  if (count === 0) {
    return {
      centre: { x: 0, y: 0, z: 0 },
      distance: 1,
      radius: MIN_RADIUS,
      minDistance: ZOOM_IN_LIMIT,
      maxDistance: ZOOM_OUT_LIMIT,
    }
  }
  const len = Math.hypot(direction.x, direction.y, direction.z) || 1
  const z = { x: direction.x / len, y: direction.y / len, z: direction.z / len }
  // The camera's axes: x to the right, y up, z back toward the camera.
  const xLen = Math.hypot(z.z, z.x)
  const x = xLen > 1e-9 ? { x: z.z / xLen, y: 0, z: -z.x / xLen } : { x: 1, y: 0, z: 0 }
  const y = {
    x: z.y * x.z - z.z * x.y,
    y: z.z * x.x - z.x * x.z,
    z: z.x * x.y - z.y * x.x,
  }
  const dot = (a: Point3, i: number) =>
    (points[i] ?? 0) * a.x + (points[i + 1] ?? 0) * a.y + (points[i + 2] ?? 0) * a.z
  const lo = { x: Infinity, y: Infinity, z: Infinity }
  const hi = { x: -Infinity, y: -Infinity, z: -Infinity }
  for (let i = 0; i < count * 3; i += 3) {
    const cx = dot(x, i)
    const cy = dot(y, i)
    const cz = dot(z, i)
    lo.x = Math.min(lo.x, cx)
    hi.x = Math.max(hi.x, cx)
    lo.y = Math.min(lo.y, cy)
    hi.y = Math.max(hi.y, cy)
    lo.z = Math.min(lo.z, cz)
    hi.z = Math.max(hi.z, cz)
  }
  // Start on the middle of the outline across the view, and of the depth along it.
  let mx = (lo.x + hi.x) / 2
  let my = (lo.y + hi.y) / 2
  const mz = (lo.z + hi.z) / 2
  const fields = halfFields(fovDeg, aspect)
  const tanV = Math.tan(fields.v)
  const tanH = Math.tan(fields.h)
  /** The distance, about the look-at point (mx, my, mz), that keeps every vertex in frame. */
  const distanceAbout = () => {
    let d = 0
    for (let i = 0; i < count * 3; i += 3) {
      const px = dot(x, i) - mx
      const py = dot(y, i) - my
      const pz = dot(z, i) - mz
      // The vertex is `d - pz` from the camera; it must land within 1 / (1 + margin).
      d = Math.max(d, pz + (1 + margin) * Math.max(Math.abs(px) / tanH, Math.abs(py) / tanV))
    }
    return d
  }
  // Perspective draws the near side of the model larger, so the middle of the box is not the
  // middle of the picture: shift the look-at point until the outline is balanced across and up.
  for (let pass = 0; pass < BALANCE_PASSES; pass += 1) {
    const d = distanceAbout()
    let loX = Infinity
    let hiX = -Infinity
    let loY = Infinity
    let hiY = -Infinity
    for (let i = 0; i < count * 3; i += 3) {
      const depth = Math.max(d - (dot(z, i) - mz), MIN_RADIUS)
      const rx = (dot(x, i) - mx) / depth
      const ry = (dot(y, i) - my) / depth
      loX = Math.min(loX, rx)
      hiX = Math.max(hiX, rx)
      loY = Math.min(loY, ry)
      hiY = Math.max(hiY, ry)
    }
    mx += ((loX + hiX) / 2) * d
    my += ((loY + hiY) / 2) * d
  }
  // The shift moved the centre: take the distance and the radius about the final one.
  let radiusSq = 0
  for (let i = 0; i < count * 3; i += 3) {
    const px = dot(x, i) - mx
    const py = dot(y, i) - my
    const pz = dot(z, i) - mz
    radiusSq = Math.max(radiusSq, px * px + py * py + pz * pz)
  }
  const centre = {
    x: x.x * mx + y.x * my + z.x * mz,
    y: x.y * mx + y.y * my + z.y * mz,
    z: x.z * mx + y.z * my + z.z * mz,
  }
  const radius = Math.max(Math.sqrt(radiusSq), MIN_RADIUS)
  // Never start inside the bounding sphere either: a model along the view direction would
  // otherwise put the camera at its near tip.
  const distance = Math.max(distanceAbout(), radius * START_CLEARANCE, MIN_RADIUS)
  // Turned to any side the model fits inside its sphere: the zoom-out limit reaches that.
  const sphere = (radius * (1 + margin)) / Math.sin(Math.min(fields.v, fields.h))
  return {
    centre,
    distance,
    radius,
    // Zoom in to 0.36 of the fit, but never into the sphere: at the limit the whole model is
    // in front of the camera, so nothing clips or flips behind it.
    minDistance: Math.max(distance * ZOOM_IN_LIMIT, radius * SPHERE_CLEARANCE),
    maxDistance: Math.max(distance * ZOOM_OUT_LIMIT, sphere),
  }
}
