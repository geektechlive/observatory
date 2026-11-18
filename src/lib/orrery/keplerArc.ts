/**
 * The two-body arc between two heliocentric positions a known time apart (#262). A looping
 * craft's whole-mission span has one position every few days, and near perihelion Parker
 * Solar Probe sweeps up to ~137° of its orbit a day: a chord or spline between samples cut
 * through the Sun. Between two samples the craft is (very nearly) on a Kepler orbit, so
 * Lambert's problem gives the velocity that joins them, and a universal-variable
 * propagation gives every point between. Exact for two-body motion; a planetary flyby
 * inside a step is the one place it is not, and there the arc still passes through both
 * samples.
 *
 * Universal variables after Curtis, Orbital Mechanics for Engineering Students
 * (Algorithms 3.4 and 5.2). Heliocentric ecliptic J2000, au and days, like the spans.
 * No imports, erasable syntax only.
 */

export interface Vec3Like {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface ArcState {
  readonly position: Vec3Like
  /** au/day. */
  readonly velocity: Vec3Like
}

/** The Gaussian gravitational constant squared: the Sun's GM, au³/day². */
const MU = 0.01720209895 ** 2
const SQRT_MU = Math.sqrt(MU)
/**
 * A step that turns less than this round the Sun is left to the spline: its chord sags
 * under 0.004% of the distance, and planet-bound craft (Juno) wiggle more than that.
 */
export const ARC_MIN_SWEEP_RAD = Math.PI / 180
/** One drawn point per this much sweep along an arc. */
const DRAW_SWEEP_RAD = (2 * Math.PI) / 180
const MAX_POINTS_PER_STEP = 90
const MAX_NEWTON = 60
const BISECTIONS = 200
/** An arc must land on its far sample to this, au (15 m): anything worse falls back. */
const LANDING_TOLERANCE_AU = 1e-10

const dot = (a: Vec3Like, b: Vec3Like) => a.x * b.x + a.y * b.y + a.z * b.z
const norm = (a: Vec3Like) => Math.sqrt(dot(a, a))

/** Stumpff C(z) and S(z), with their series near 0 (where the closed forms cancel). */
function stumpff(z: number): { c: number; s: number } {
  if (Math.abs(z) < 1) {
    let c = 0
    let s = 0
    let term = 1
    // C = Σ (-z)^k / (2k+2)!, S = Σ (-z)^k / (2k+3)!
    let factC = 2
    let factS = 6
    for (let k = 0; k < 14; k += 1) {
      c += term / factC
      s += term / factS
      term *= -z
      factC *= (2 * k + 3) * (2 * k + 4)
      factS *= (2 * k + 4) * (2 * k + 5)
    }
    return { c, s }
  }
  if (z > 0) {
    const q = Math.sqrt(z)
    // 1 - cos and cosh - 1 as 2 sin² and 2 sinh² of the half angle: no cancellation near 2π.
    return { c: (2 * Math.sin(q / 2) ** 2) / z, s: (q - Math.sin(q)) / (q * q * q) }
  }
  const q = Math.sqrt(-z)
  return { c: (2 * Math.sinh(q / 2) ** 2) / -z, s: (Math.sinh(q) - q) / (q * q * q) }
}

/** Ecliptic north: the sense of motion of the planets, for a caller with no better hint. */
export const ECLIPTIC_NORTH: Vec3Like = { x: 0, y: 0, z: 1 }

const cross = (a: Vec3Like, b: Vec3Like): Vec3Like => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
})

/**
 * The angle swept from a to b around the Sun, radians in [0, 2π), going the way `north`
 * (the orbit's angular momentum, any length) says the body moves. Retrograde comets and
 * steeply inclined orbits need their own north (#262 review): ecliptic north would send
 * them the long way round, through the Sun.
 */
export function arcSweep(a: Vec3Like, b: Vec3Like, north: Vec3Like = ECLIPTIC_NORTH): number {
  const ra = norm(a)
  const rb = norm(b)
  if (ra === 0 || rb === 0) return 0
  const cos = Math.max(-1, Math.min(1, dot(a, b) / (ra * rb)))
  const theta = Math.acos(cos)
  return dot(cross(a, b), north) >= 0 ? theta : 2 * Math.PI - theta
}

/**
 * The orbit's north from a step short enough that its sense is not in doubt (it turns
 * between `minRad` and a quarter turn): a × b, or null.
 */
export function stepNorth(a: Vec3Like, b: Vec3Like, minRad = 1e-6): Vec3Like | null {
  const ra = norm(a)
  const rb = norm(b)
  if (ra === 0 || rb === 0) return null
  const theta = Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (ra * rb))))
  return theta >= minRad && theta < Math.PI / 2 ? cross(a, b) : null
}

/**
 * The velocity at `a` that reaches `b` after `dtDays` on a single-revolution conic around
 * the Sun, moving the way `north` says, or null when there is none.
 */
export function lambertVelocity(
  a: Vec3Like,
  b: Vec3Like,
  dtDays: number,
  north: Vec3Like = ECLIPTIC_NORTH,
): Vec3Like | null {
  const r1 = norm(a)
  const r2 = norm(b)
  const theta = arcSweep(a, b, north)
  if (!(dtDays > 0) || r1 === 0 || r2 === 0 || theta === 0) return null
  const cosT = Math.cos(theta)
  if (1 - cosT < 1e-14) return null
  const A = Math.sin(theta) * Math.sqrt((r1 * r2) / (1 - cosT))
  const target = SQRT_MU * dtDays
  const y = (z: number): number => {
    const { c, s } = stumpff(z)
    return r1 + r2 + (A * (z * s - 1)) / Math.sqrt(c)
  }
  // Time of flight minus the target. Increasing in z; where y < 0 the time is "too short".
  const F = (z: number): number => {
    const yz = y(z)
    if (!(yz >= 0)) return -1
    const { c, s } = stumpff(z)
    return (yz / c) ** 1.5 * s + A * Math.sqrt(yz) - target
  }
  const zMax = 4 * Math.PI * Math.PI * (1 - 1e-9)
  let lo = -4 * Math.PI * Math.PI
  for (let k = 0; k < 60 && F(lo) >= 0; k += 1) lo *= 2
  let hi = zMax
  if (!(F(lo) < 0) || !(F(hi) > 0)) return null
  for (let k = 0; k < BISECTIONS && hi - lo > 1e-15 * Math.max(1, Math.abs(lo)); k += 1) {
    const mid = (lo + hi) / 2
    if (F(mid) < 0) lo = mid
    else hi = mid
  }
  const z = (lo + hi) / 2
  const yz = y(z)
  if (!(yz > 0)) return null
  const f = 1 - yz / r1
  const g = A * Math.sqrt(yz / MU)
  if (g === 0 || !Number.isFinite(g)) return null
  return { x: (b.x - f * a.x) / g, y: (b.y - f * a.y) / g, z: (b.z - f * a.z) / g }
}

/** Where a body at (r, v) is `dtDays` later on its two-body conic, or null if unsolved. */
export function propagateKepler(r: Vec3Like, v: Vec3Like, dtDays: number): ArcState | null {
  const r0 = norm(r)
  if (r0 === 0) return null
  const vr0 = dot(r, v) / r0
  const alpha = 2 / r0 - dot(v, v) / MU
  const target = SQRT_MU * dtDays
  let chi = SQRT_MU * Math.abs(alpha) * dtDays
  if (!Number.isFinite(chi) || chi === 0) chi = target / r0
  let converged = false
  for (let k = 0; k < MAX_NEWTON; k += 1) {
    const z = alpha * chi * chi
    const { c, s } = stumpff(z)
    const fx =
      ((r0 * vr0) / SQRT_MU) * chi * chi * c + (1 - alpha * r0) * chi ** 3 * s + r0 * chi - target
    const dfx = ((r0 * vr0) / SQRT_MU) * chi * (1 - z * s) + (1 - alpha * r0) * chi * chi * c + r0
    const step = fx / dfx
    chi -= step
    if (Math.abs(step) < 1e-14 * Math.max(1, Math.abs(chi))) {
      converged = true
      break
    }
  }
  if (!converged || !Number.isFinite(chi)) return null
  const z = alpha * chi * chi
  const { c, s } = stumpff(z)
  const f = 1 - (chi * chi * c) / r0
  const g = dtDays - (chi ** 3 * s) / SQRT_MU
  const position = { x: f * r.x + g * v.x, y: f * r.y + g * v.y, z: f * r.z + g * v.z }
  const rn = norm(position)
  if (!(rn > 0)) return null
  const fdot = (SQRT_MU / (rn * r0)) * (z * chi * s - chi)
  const gdot = 1 - (chi * chi * c) / rn
  return {
    position,
    velocity: {
      x: fdot * r.x + gdot * v.x,
      y: fdot * r.y + gdot * v.y,
      z: fdot * r.z + gdot * v.z,
    },
  }
}

/** The start velocity of the arc from a to b, checked to land on b, or null. */
function arcVelocity(a: Vec3Like, b: Vec3Like, dtDays: number, north: Vec3Like): Vec3Like | null {
  if (arcSweep(a, b, north) < ARC_MIN_SWEEP_RAD) return null
  const v = lambertVelocity(a, b, dtDays, north)
  if (!v) return null
  const end = propagateKepler(a, v, dtDays)
  if (!end) return null
  const miss = Math.hypot(end.position.x - b.x, end.position.y - b.y, end.position.z - b.z)
  return miss <= LANDING_TOLERANCE_AU * Math.max(1, norm(b)) ? v : null
}

/**
 * The craft a fraction `s` of the way from sample a to sample b (`dtDays` apart) along
 * their two-body arc. Null when the step barely turns (a spline does as well there) or no
 * arc lands on b: the caller keeps its spline.
 */
export function keplerArcState(
  a: Vec3Like,
  b: Vec3Like,
  dtDays: number,
  s: number,
  north: Vec3Like = ECLIPTIC_NORTH,
): ArcState | null {
  const v = arcVelocity(a, b, dtDays, north)
  if (!v) return null
  if (s <= 0) return { position: a, velocity: v }
  return propagateKepler(a, v, s * dtDays)
}

/**
 * Points strictly between a and b along their arc, with their day offsets from a, for
 * drawing; empty when the step is drawn as a straight line.
 */
export function keplerArcPoints(
  a: Vec3Like,
  b: Vec3Like,
  dtDays: number,
  north: Vec3Like = ECLIPTIC_NORTH,
): { readonly dt: number; readonly position: Vec3Like }[] {
  const sweep = arcSweep(a, b, north)
  // Under two drawn points' worth of turn the chord sags < 0.06%: keep the straight line.
  if (sweep < 2 * DRAW_SWEEP_RAD) return []
  const v = arcVelocity(a, b, dtDays, north)
  if (!v) return []
  const n = Math.min(MAX_POINTS_PER_STEP, Math.ceil(sweep / DRAW_SWEEP_RAD))
  const out: { dt: number; position: Vec3Like }[] = []
  // Even in time would bunch the points at aphelion; even in sweep needs the anomaly,
  // so step in time but finely enough that the fastest part still bends smoothly.
  const steps = n * 4
  let last = a
  for (let k = 1; k < steps; k += 1) {
    const dt = (k / steps) * dtDays
    const p = propagateKepler(a, v, dt)
    if (!p) return []
    if (arcSweep(last, p.position, north) >= DRAW_SWEEP_RAD || k === steps - 1) {
      out.push({ dt, position: p.position })
      last = p.position
    }
  }
  return out
}
