/**
 * The fly-in's timeline inside the orrery (#268, B+). Pure: the renderer asks where the camera
 * is at a time and how far the view has eased to true scale.
 *
 * Enter, from the view the visitor had:
 *  1. The ease (EASE_MS): `trueness` goes 0 to 1 while the camera keeps the visitor's side and
 *     its distance goes geometrically from d0 to d1, so the body nearest the craft keeps about
 *     its apparent separation while everything shrinks to true size (scaleRatio).
 *  2. The flight (FLIGHT_MS): from d1 in to the arrival distance, eased in log distance
 *     (flightDistanceKm, the close-up's own ease). The camera turns from the visitor's side to
 *     the framing side (framingApproach, then flightStart) by log distance, done by
 *     `turnEndDistance`, so the last stretch is the straight line flightStart found clear.
 *     When that turn would sweep through a body, it is done in the ease instead.
 * Leave reverses it: back out to d1 at true scale, then the ease back to the visitor's scale,
 * distance and side.
 *
 * Directions are unit vectors from the craft to the camera, scene axes. Distances are in any
 * one unit (the renderer's scene units).
 */
import { flightDistanceKm } from './trueScale'

export type V3 = readonly [number, number, number]

/** The ease to true scale, ms: the owner found 1 s a little long (2026-11-20). */
export const EASE_MS = 700
/**
 * The last straight stretch in starts this far from the craft, km (the old close-up's flight
 * start, #261): flightStart finds a side clear of every body from here in.
 */
export const FLIGHT_START_KM = 1_000_000
/** The flight in: the owner's ~4 s (2026-11-17). */
export const FLIGHT_MS = 4_000
/** Back out to the flight start, ms. */
export const LEAVE_FLIGHT_MS = 2_000
/** The ease back to the visitor's scale, ms. */
export const LEAVE_EASE_MS = 700

/** A body the turn must not sweep through: its centre relative to the craft, and radius. */
export interface PathObstacle {
  readonly center: V3
  readonly radius: number
}

export interface FlyInInput {
  /** The visitor's side: craft to camera. */
  readonly fromDir: V3
  /** The framing side the flight arrives on. */
  readonly toDir: V3
  /** The visitor's camera distance from the craft. */
  readonly d0: number
  /** How much farther out the same view sits at true scale (scaleRatio). */
  readonly ratio: number
  readonly arrival: number
  /** The turn to `toDir` is done by this distance (flightStart's clear start). */
  readonly turnEndDistance: number
  readonly obstacles: readonly PathObstacle[]
  /** d1's limits. */
  readonly d1Min: number
  readonly d1Max: number
}

export interface FlyInPlan {
  readonly fromDir: V3
  readonly toDir: V3
  readonly d0: number
  readonly d1: number
  readonly arrival: number
  readonly turnEndDistance: number
  /** The turn happens in the ease, so the flight is straight. */
  readonly turnFirst: boolean
}

export interface FlyInFrame {
  /** 0 is the visitor's scale, 1 true scale; already eased. */
  readonly trueness: number
  readonly distance: number
  readonly direction: V3
  readonly phase: 'ease' | 'flight' | 'arrived'
}

export interface LeavePlan {
  /** Where the camera is when the leave starts. */
  readonly fromDir: V3
  readonly from: number
  /** The visitor's side, to end on. */
  readonly toDir: V3
  readonly d1: number
  readonly d0: number
}

export interface LeaveFrame {
  readonly trueness: number
  readonly distance: number
  readonly direction: V3
  readonly phase: 'flight' | 'ease' | 'done'
}

/** Margin round a body the path keeps, as a share of its radius. */
const CLEARANCE = 1.05

const clamp01 = (x: number) => Math.max(0, Math.min(1, x))
const smoothstep = (x: number) => {
  const t = clamp01(x)
  return t * t * (3 - 2 * t)
}
const geo = (a: number, b: number, t: number) => Math.exp(Math.log(a) * (1 - t) + Math.log(b) * t)
const length = (v: V3) => Math.hypot(v[0], v[1], v[2])
const unit = (v: V3): V3 => {
  const l = length(v)
  return l === 0 ? [0, 0, 1] : [v[0] / l, v[1] / l, v[2] / l]
}

/** Spherical interpolation of two unit vectors; any perpendicular for opposite ones. */
export function slerp(a: V3, b: V3, t: number): V3 {
  const ua = unit(a)
  const ub = unit(b)
  const c = Math.max(-1, Math.min(1, ua[0] * ub[0] + ua[1] * ub[1] + ua[2] * ub[2]))
  if (c > 1 - 1e-12) return ub
  const angle = Math.acos(c)
  let ortho: V3 = [ub[0] - ua[0] * c, ub[1] - ua[1] * c, ub[2] - ua[2] * c]
  if (length(ortho) < 1e-9) {
    // Opposite: turn about any axis across `a`.
    const helper: V3 = Math.abs(ua[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0]
    ortho = [
      ua[1] * helper[2] - ua[2] * helper[1],
      ua[2] * helper[0] - ua[0] * helper[2],
      ua[0] * helper[1] - ua[1] * helper[0],
    ]
  }
  const o = unit(ortho)
  const s = Math.sin(angle * t)
  const k = Math.cos(angle * t)
  return unit([ua[0] * k + o[0] * s, ua[1] * k + o[1] * s, ua[2] * k + o[2] * s])
}

/** How far through the turn the flight is at `distance`: by log distance, d1 to turnEnd. */
function turnShare(plan: FlyInPlan, distance: number): number {
  if (plan.turnFirst || plan.d1 <= plan.turnEndDistance) return 1
  return smoothstep(Math.log(plan.d1 / distance) / Math.log(plan.d1 / plan.turnEndDistance))
}

function flightFrame(plan: FlyInPlan, s: number): { distance: number; direction: V3 } {
  const distance = flightDistanceKm(s, plan.d1, plan.arrival)
  const direction = plan.turnFirst
    ? unit(plan.toDir)
    : slerp(plan.fromDir, plan.toDir, turnShare(plan, distance))
  return { distance, direction }
}

const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross3 = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]
const angleBetween = (a: V3, b: V3) => Math.acos(Math.max(-1, Math.min(1, dot3(unit(a), unit(b)))))

/**
 * The least angle between direction `p` and the part of the turn from `from` to `to` (slerp)
 * between shares s0 and s1. Exact: the turn runs along one great circle.
 */
export function angleToArc(from: V3, to: V3, s0: number, s1: number, p: V3): number {
  const a = slerp(from, to, Math.min(s0, s1))
  const b = slerp(from, to, Math.max(s0, s1))
  const ends = Math.min(angleBetween(a, p), angleBetween(b, p))
  const span = angleBetween(a, b)
  if (span < 1e-9) return ends
  // The plane of the turn, by a point inside it (slerp's own, so opposite ends work too).
  const mid = slerp(from, to, (Math.min(s0, s1) + Math.max(s0, s1)) / 2)
  const n = unit(cross3(a, mid))
  const up = unit(p)
  const off = dot3(up, n)
  // The point of the great circle nearest p, and whether it lies on this part of the arc.
  const onPlane: V3 = [up[0] - n[0] * off, up[1] - n[1] * off, up[2] - n[2] * off]
  if (length(onPlane) < 1e-12) return Math.PI / 2
  const q = unit(onPlane)
  const within = Math.abs(angleBetween(a, q) + angleBetween(q, b) - span) < 1e-9
  return within ? Math.asin(Math.min(1, Math.abs(off))) : ends
}

/**
 * Whether the camera turning from `from` to `to` meets no body, while its distance from the
 * craft runs over [lo, hi] and `shareAt(distance)` says how far through the turn it is.
 * A body can only be met while the camera's distance is within its radius of the body's,
 * and then only from directions within asin(radius / distance) of it: so each body is
 * tested against the part of the turn made at those distances. Exact, and a little
 * conservative (the whole cone, at every distance in the band).
 */
export function turnClear(
  from: V3,
  to: V3,
  lo: number,
  hi: number,
  shareAt: (distance: number) => number,
  obstacles: readonly PathObstacle[],
): boolean {
  return obstacles.every((o) => {
    const at = length(o.center)
    const r = o.radius * CLEARANCE
    const bandLo = Math.max(lo, at - r)
    const bandHi = Math.min(hi, at + r)
    if (bandLo > bandHi) return true
    if (at <= r) return false
    const cone = Math.asin(r / at)
    return angleToArc(from, to, shareAt(bandHi), shareAt(bandLo), o.center) >= cone
  })
}

/** Whether the straight radial line along `dir` from `from` in to `to` stays clear of every body. */
export function radialClear(
  dir: V3,
  from: number,
  to: number,
  obstacles: readonly PathObstacle[],
): boolean {
  const d = unit(dir)
  const lo = Math.min(from, to)
  const hi = Math.max(from, to)
  return obstacles.every((o) => {
    // The point on the line nearest the body's centre, held to the segment.
    const along = Math.max(
      lo,
      Math.min(hi, o.center[0] * d[0] + o.center[1] * d[1] + o.center[2] * d[2]),
    )
    const gap = Math.hypot(
      d[0] * along - o.center[0],
      d[1] * along - o.center[1],
      d[2] * along - o.center[2],
    )
    return gap >= o.radius * CLEARANCE
  })
}

/**
 * The flight's plan. Where the camera turns from the visitor's side to the framing side, in
 * this order: in the flight (between d1 and the turn-end distance), in the ease (between d0 and
 * d1), or not at all (straight in on the visitor's side). Each is taken only when the turn
 * meets no body (turnClear) and the straight line in after it is clear; with none clear, the
 * turn in the ease is the best left.
 */
export function planFlyIn(input: FlyInInput): FlyInPlan {
  const d1 = Math.min(input.d1Max, Math.max(input.d1Min, input.d0 * input.ratio))
  const plan: FlyInPlan = {
    fromDir: unit(input.fromDir),
    toDir: unit(input.toDir),
    d0: input.d0,
    d1,
    arrival: input.arrival,
    turnEndDistance: input.turnEndDistance,
    turnFirst: false,
  }
  const obs = input.obstacles
  const turnEnd = Math.min(input.turnEndDistance, d1)
  const { fromDir, toDir } = plan
  const flightTurn = turnClear(fromDir, toDir, turnEnd, d1, (d) => turnShare(plan, d), obs)
  if (flightTurn && radialClear(toDir, turnEnd, plan.arrival, obs)) return plan
  // In the ease, distance and turn run on the same share: d = d0^(1-t) d1^t.
  const lo = Math.min(input.d0, d1)
  const hi = Math.max(input.d0, d1)
  const easeShare = (d: number) =>
    d1 === input.d0 ? 1 : clamp01(Math.log(d / input.d0) / Math.log(d1 / input.d0))
  const easeTurn = turnClear(fromDir, toDir, lo, hi, easeShare, obs)
  if (easeTurn && radialClear(toDir, d1, plan.arrival, obs)) return { ...plan, turnFirst: true }
  if (radialClear(plan.fromDir, d1, plan.arrival, obs)) {
    return { ...plan, toDir: plan.fromDir, turnFirst: true }
  }
  return { ...plan, turnFirst: true }
}

/** The enter timeline at `elapsedMs` since it began. */
export function enterAt(plan: FlyInPlan, elapsedMs: number, reducedMotion = false): FlyInFrame {
  if (reducedMotion || elapsedMs >= EASE_MS + FLIGHT_MS) {
    return { trueness: 1, distance: plan.arrival, direction: unit(plan.toDir), phase: 'arrived' }
  }
  if (elapsedMs < EASE_MS) {
    const t = smoothstep(elapsedMs / EASE_MS)
    return {
      trueness: t,
      distance: geo(plan.d0, plan.d1, t),
      direction: plan.turnFirst ? slerp(plan.fromDir, plan.toDir, t) : unit(plan.fromDir),
      phase: 'ease',
    }
  }
  return { trueness: 1, ...flightFrame(plan, (elapsedMs - EASE_MS) / FLIGHT_MS), phase: 'flight' }
}

/** The leave timeline at `elapsedMs` since it began. */
export function leaveAt(plan: LeavePlan, elapsedMs: number, reducedMotion = false): LeaveFrame {
  if (reducedMotion || elapsedMs >= LEAVE_FLIGHT_MS + LEAVE_EASE_MS) {
    return { trueness: 0, distance: plan.d0, direction: unit(plan.toDir), phase: 'done' }
  }
  if (elapsedMs < LEAVE_FLIGHT_MS) {
    const s = elapsedMs / LEAVE_FLIGHT_MS
    return {
      trueness: 1,
      distance: flightDistanceKm(s, plan.from, plan.d1),
      direction: unit(plan.fromDir),
      phase: 'flight',
    }
  }
  const t = smoothstep((elapsedMs - LEAVE_FLIGHT_MS) / LEAVE_EASE_MS)
  return {
    trueness: 1 - t,
    distance: geo(plan.d1, plan.d0, t),
    direction: slerp(plan.fromDir, plan.toDir, t),
    phase: 'ease',
  }
}

/** Decorations (orbit lines, paths, labels, other markers) are whole this far out, km. */
export const DECOR_FULL_KM = 3e7
/** And gone by this close, km. */
export const DECOR_GONE_KM = 3e6

/**
 * How much of the orrery's decoration shows with the camera `km` from the craft: 1 far out, 0
 * close in, smooth in log distance. A design choice (the lines and labels make way for the
 * craft); it also keeps the lines, whose vertices hold big scene numbers, away from the
 * close-up, where their float32 rounding (about a km near Parker, thousands near Voyager)
 * would show.
 */
export function decorAt(km: number): number {
  if (!(km < DECOR_FULL_KM)) return 1
  if (!(km > DECOR_GONE_KM)) return 0
  return smoothstep(Math.log(km / DECOR_GONE_KM) / Math.log(DECOR_FULL_KM / DECOR_GONE_KM))
}

/** A point at true scale and as the visitor's mode draws it. */
export interface Placed2 {
  readonly true: V3
  readonly drawn: V3
}

/**
 * How much farther out the same view sits at true scale: the craft's separation from the
 * body nearest it by true distance, true over drawn. 1 when the drawn separation is zero.
 */
export function scaleRatio(craft: Placed2, bodies: readonly Placed2[]): number {
  let best: Placed2 | null = null
  let bestTrue = Infinity
  for (const b of bodies) {
    const d = Math.hypot(
      b.true[0] - craft.true[0],
      b.true[1] - craft.true[1],
      b.true[2] - craft.true[2],
    )
    if (d < bestTrue) {
      bestTrue = d
      best = b
    }
  }
  if (!best) return 1
  const drawn = Math.hypot(
    best.drawn[0] - craft.drawn[0],
    best.drawn[1] - craft.drawn[1],
    best.drawn[2] - craft.drawn[2],
  )
  return drawn > 0 && Number.isFinite(bestTrue / drawn) ? bestTrue / drawn : 1
}
