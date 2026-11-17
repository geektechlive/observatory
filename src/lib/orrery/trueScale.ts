/**
 * The fly-in's geometry (#261): the close-up of a spacecraft places everything at its true
 * position in km relative to the craft, which sits at the origin. three.js composes each
 * object's matrix with the camera's in 64-bit JavaScript numbers before the GPU sees it, and
 * the scene uses a logarithmic depth buffer, so true km work from metres to light-hours: sizes,
 * phases (one point light at the Sun's true place) and what passes in front are all true, from
 * any camera position, with no compression to get wrong. These are the pure parts.
 */
import type { BodyName } from './bodies'
import type { Vec3 } from './scale'
import { AU_KM } from './units'

/** A vector in km. */
export type Km3 = readonly [number, number, number]

/**
 * True radii, km: the IAU 2015 nominal solar radius, and the planets' mean radii (NASA
 * planetary fact sheets). The orrery's proportional mode reads these too.
 */
export const BODY_RADIUS_KM: Readonly<Record<BodyName, number>> = {
  Sun: 695_700,
  Mercury: 2_440,
  Venus: 6_052,
  Earth: 6_371,
  Mars: 3_390,
  Jupiter: 69_911,
  Saturn: 58_232,
  Uranus: 25_362,
  Neptune: 24_622,
}

/** The Moon's mean radius, km (JPL Planetary Satellite Physical Parameters, read 2026-11-17). */
export const MOON_RADIUS_KM = 1_737.4

/** A body's position relative to the craft, km: heliocentric au in, km out. */
export function relativeKm(bodyAu: Vec3, craftAu: Vec3): Km3 {
  return [
    (bodyAu.x - craftAu.x) * AU_KM,
    (bodyAu.y - craftAu.y) * AU_KM,
    (bodyAu.z - craftAu.z) * AU_KM,
  ]
}

/** The angle a sphere's edge makes with its centre, seen from `distanceKm` away; π/2 inside it. */
export function angularRadius(radiusKm: number, distanceKm: number): number {
  return distanceKm <= radiusKm ? Math.PI / 2 : Math.asin(radiusKm / distanceKm)
}

const length = (v: Km3) => Math.hypot(v[0], v[1], v[2])
const dot = (a: Km3, b: Km3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const scale = (v: Km3, k: number): Km3 => [v[0] * k, v[1] * k, v[2] * k]
const sub = (a: Km3, b: Km3): Km3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a: Km3, b: Km3): Km3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const unit = (v: Km3): Km3 => {
  const l = length(v)
  return l === 0 ? [0, 0, 1] : scale(v, 1 / l)
}

/**
 * The phase angle at a body, radians: between the directions from it to the Sun and to the
 * viewer. 0 is full, π is new. The scene's Sun light gives this by itself; tests check it.
 */
export function phaseAngle(bodyToSun: Km3, bodyToViewer: Km3): number {
  const c = dot(unit(bodyToSun), unit(bodyToViewer))
  return Math.acos(Math.max(-1, Math.min(1, c)))
}

/** A body the flight must not start inside or fly through. */
export interface Obstacle {
  /** Its centre relative to the craft, km. */
  readonly center: Km3
  readonly radiusKm: number
}

/** Room kept round a body, as a share of its radius. */
const CLEARANCE = 0.05

/**
 * How clear the straight line from `start` in to the craft (the origin) stays of a body: the
 * nearest approach over the body's kept radius. Above 1 is clear. The kept radius never
 * reaches the craft itself, so a craft skimming a cloud deck (Juno) can still be reached.
 */
function clearance(start: Km3, o: Obstacle): number {
  const toCraft = scale(start, -1)
  const t = Math.max(0, Math.min(1, dot(sub(o.center, start), toCraft) / dot(toCraft, toCraft)))
  const nearest = sub(
    [start[0] + toCraft[0] * t, start[1] + toCraft[1] * t, start[2] + toCraft[2] * t],
    o.center,
  )
  const kept = Math.min(o.radiusKm * (1 + CLEARANCE), length(o.center) * (1 - 1e-6))
  return length(nearest) / kept
}

/** Directions to try, nearest the asked-for one first: rings of 5° steps, 12 around each. */
function* candidates(dir: Km3): Generator<Km3> {
  const d = unit(dir)
  yield d
  const helper: Km3 = Math.abs(d[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
  const u = unit(cross(d, helper))
  const w = cross(d, u)
  for (let deg = 5; deg <= 180; deg += 5) {
    const a = (deg * Math.PI) / 180
    for (let k = 0; k < 12; k += 1) {
      const b = (k * Math.PI) / 6
      const s = Math.sin(a)
      yield unit([
        d[0] * Math.cos(a) + (u[0] * Math.cos(b) + w[0] * Math.sin(b)) * s,
        d[1] * Math.cos(a) + (u[1] * Math.cos(b) + w[1] * Math.sin(b)) * s,
        d[2] * Math.cos(a) + (u[2] * Math.cos(b) + w[2] * Math.sin(b)) * s,
      ])
    }
  }
}

/**
 * Where the fly-in starts, km from the craft: `distanceKm` out along `dir` (the side the
 * visitor was looking from), or the nearest direction from which neither the start nor the
 * line in to the craft touches a body. With none clear, the one that stays clearest.
 */
export function flightStart(dir: Km3, distanceKm: number, obstacles: readonly Obstacle[]): Km3 {
  let best: Km3 = scale(unit(dir), distanceKm)
  let bestRoom = -Infinity
  for (const d of candidates(dir)) {
    const start = scale(d, distanceKm)
    const room = obstacles.reduce((m, o) => Math.min(m, clearance(start, o)), Infinity)
    if (room > 1) return start
    if (room > bestRoom) {
      bestRoom = room
      best = start
    }
  }
  return best
}

/** A craft's real size from ESA DISCOS, metres: its body (box or cylinder) and full span. */
export interface CraftSize {
  readonly bodyM: number
  readonly spanM: number | null
}

/** DISCOS's span counts arrays, booms or a sunshield when it is this much bigger than the body. */
const SPAN_COUNTS_APPENDAGES = 1.5

/**
 * Metres per scene unit for a model whose robust radius (its body) is 1 unit and whose
 * farthest vertex is `fullRadius` units out (#261). Where DISCOS's span counts the arrays and
 * booms the model also has, the whole model is scaled to that span; where the span is only
 * the body, the body is scaled to the body. Measured on every craft model on 2026-11-17: each
 * then matched DISCOS's span or body to within 0.1 m.
 */
export function modelMetresPerUnit(size: CraftSize, fullRadius: number): number {
  if (size.spanM !== null && size.spanM >= SPAN_COUNTS_APPENDAGES * size.bodyM) {
    return size.spanM / 2 / fullRadius
  }
  return size.bodyM / 2
}

/** The biggest-looking body sits this far off the centre of the view, behind the craft. */
const FRAME_OFFSET = (12 * Math.PI) / 180

/**
 * Which side the fly-in comes in from (#261): opposite the body that looks biggest from the
 * craft, turned FRAME_OFFSET toward `fallback` (the side the visitor was looking from), so the
 * Sun near Parker or Jupiter near Juno sits beside the craft in the frame. With no bodies, the
 * fallback.
 */
export function framingApproach(
  bodies: readonly { relKm: Km3; radiusKm: number }[],
  fallback: Km3,
): Km3 {
  let best: Km3 | null = null
  let bestAngle = -1
  for (const b of bodies) {
    const a = angularRadius(b.radiusKm, length(b.relKm))
    if (a > bestAngle) {
      bestAngle = a
      best = b.relKm
    }
  }
  if (!best) return unit(fallback)
  const away = scale(unit(best), -1)
  // The fallback's part across `away`: which way to turn. Parallel, any perpendicular will do.
  let across = sub(unit(fallback), scale(away, dot(unit(fallback), away)))
  if (length(across) < 1e-6) across = cross(away, Math.abs(away[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0])
  const u = unit(across)
  return unit([
    away[0] * Math.cos(FRAME_OFFSET) + u[0] * Math.sin(FRAME_OFFSET),
    away[1] * Math.cos(FRAME_OFFSET) + u[1] * Math.sin(FRAME_OFFSET),
    away[2] * Math.cos(FRAME_OFFSET) + u[2] * Math.sin(FRAME_OFFSET),
  ])
}

/**
 * The camera's distance from the craft `s` of the way through the flight (0 to 1): eased
 * (slow out, slow in) in log distance, so it covers the far kilometres fast and slows as it
 * arrives, the way a ship would.
 */
export function flightDistanceKm(s: number, startKm: number, endKm: number): number {
  if (!(s > 0)) return startKm
  if (s >= 1) return endKm
  const e = s * s * (3 - 2 * s)
  return Math.exp(Math.log(startKm) * (1 - e) + Math.log(endKm) * e)
}
