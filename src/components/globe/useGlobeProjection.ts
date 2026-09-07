import { useMemo } from 'react'

/**
 * Orthographic projection primitives for the globe.
 *
 * Deliberately free of any data imports (no topojson / world-atlas) so unit
 * tests can load this module without pulling a 100kB JSON fixture through the
 * bundler.
 */

export interface Projected {
  x: number
  y: number
  /** Depth along the view axis. Positive is the near (visible) hemisphere. */
  z: number
  visible: boolean
}

export interface LatLon {
  lat: number
  lon: number
}

/** A projected marker plus its index in the source array (keys, SMIL offsets). */
export interface ProjectedMarker<T> extends Projected {
  point: T
  index: number
}

/** Orthographic projection of a lat/lon onto a sphere of radius R. */
export function project(lat: number, lon: number, rotation: number, R: number): Projected {
  const lr = ((lon + rotation + 540) % 360) - 180
  const phi = (lat * Math.PI) / 180
  const lam = (lr * Math.PI) / 180
  const x = Math.cos(phi) * Math.sin(lam)
  const y = Math.sin(phi)
  const z = Math.cos(phi) * Math.cos(lam)
  return { x: x * R, y: -y * R, z, visible: z > 0 }
}

/**
 * Project a whole layer in one pass, dropping back-hemisphere points.
 *
 * Every marker call site used to run `project()` inline inside JSX, so a single
 * rotation tick re-ran trig once per marker per render. Callers now memoize one
 * array per layer instead.
 */
export function projectMany<T extends LatLon>(
  points: readonly T[],
  rotation: number,
  R: number,
): ProjectedMarker<T>[] {
  const out: ProjectedMarker<T>[] = []
  for (let i = 0; i < points.length; i++) {
    const point = points[i]
    if (point === undefined) continue
    const p = project(point.lat, point.lon, rotation, R)
    if (!p.visible) continue
    out.push({ ...p, point, index: i })
  }
  return out
}

/** Memoized `projectMany`: one pass per layer per rotation tick. */
export function useProjected<T extends LatLon>(
  points: readonly T[],
  rotation: number,
  R: number,
): ProjectedMarker<T>[] {
  return useMemo(() => projectMany(points, rotation, R), [points, rotation, R])
}

/** Pen-up path — never emits Z, handles back-hemisphere gaps correctly. */
export function penPath(
  points: readonly [number, number][],
  rotation: number,
  R: number,
  backHemi = false,
): string {
  let d = ''
  let penDown = false
  for (const [lat, lon] of points) {
    const p = project(lat, lon, rotation, R)
    const draw = backHemi ? p.z <= 0 : p.z > 0
    if (!draw) {
      penDown = false
      continue
    }
    d += penDown ? `L${p.x.toFixed(1)},${p.y.toFixed(1)}` : `M${p.x.toFixed(1)},${p.y.toFixed(1)}`
    penDown = true
  }
  return d
}

/**
 * Coastline path — pen-up, tracks whether all points are front-hemisphere.
 * Rings that straddle the boundary must be stroke-only to avoid SVG fill chord
 * artifacts.
 */
export function coastPathData(
  coords: readonly [number, number][],
  rotation: number,
  R: number,
): { d: string; full: boolean } {
  let d = ''
  let penDown = false
  let full = true
  for (const [lat, lon] of coords) {
    const p = project(lat, lon, rotation, R)
    if (!p.visible) {
      full = false
      penDown = false
      continue
    }
    d += penDown ? `L${p.x.toFixed(1)},${p.y.toFixed(1)}` : `M${p.x.toFixed(1)},${p.y.toFixed(1)}`
    penDown = true
  }
  return { d, full }
}

/** A filled circle expressed as path data, so many dots can share one node. */
export function circlePath(cx: number, cy: number, r: number): string {
  const x = (cx - r).toFixed(1)
  const y = cy.toFixed(1)
  return `M${x},${y}a${r},${r} 0 1,0 ${r * 2},0a${r},${r} 0 1,0 ${-r * 2},0`
}

// ---------------------------------------------------------------------------
// Static graticule point arrays
// ---------------------------------------------------------------------------
export const LAT_LINES: [number, number][][] = [-60, -30, 0, 30, 60].map((lat) => {
  const pts: [number, number][] = []
  for (let lon = -180; lon <= 180; lon += 3) pts.push([lat, lon])
  return pts
})

export const LON_LINES: [number, number][][] = [-120, -90, -60, -30, 0, 30, 60, 90, 120].map(
  (lon) => {
    const pts: [number, number][] = []
    for (let lat = -90; lat <= 90; lat += 3) pts.push([lat, lon])
    return pts
  },
)

/** Fallback sinusoid orbit, used only when no real SGP4 trail is available. */
export const FALLBACK_ORBIT: [number, number][] = (() => {
  const pts: [number, number][] = []
  for (let lon = -180; lon <= 180; lon += 2) pts.push([51.6 * Math.sin((lon * Math.PI) / 180), lon])
  return pts
})()
