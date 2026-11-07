/**
 * A moon's orbit line (#107), planet-centred, in au. Sampled from the moon's own Horizons
 * data over one period, centred on the date where the window allows: that is where the
 * moon really goes, perturbations and all. When the window is shorter than a period
 * (Iapetus: 79 days against ±15), the osculating ellipse from the state now instead,
 * with μ from Kepler's third law and Horizons' own period and semi-major axis. The
 * inspector says which. Both pass through the moon's position now.
 */
import { type MoonBody, moonRelative } from './moonState'
import type { Vec3 } from './scale'
import { AU_KM } from './units'

export type MoonOrbitKind = 'sampled' | 'osculating'

export interface MoonOrbit {
  kind: MoonOrbitKind
  /** A closed loop (the last point joins the first), planet-centred, au. */
  points: Vec3[]
}

/** Points per loop. */
export const MOON_ORBIT_POINTS = 128

/** The Julian dates every span of a moon covers. */
function window(body: MoonBody): { from: number; to: number } | null {
  if (body.spans.length === 0) return null
  const from = Math.max(...body.spans.map((s) => s.start))
  const to = Math.min(...body.spans.map((s) => s.start + (s.samples.length / 6 - 1) * s.step))
  return to > from ? { from, to } : null
}

const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
})
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z
const len = (a: Vec3) => Math.hypot(a.x, a.y, a.z)
const scale = (a: Vec3, k: number): Vec3 => ({ x: a.x * k, y: a.y * k, z: a.z * k })
const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })

/**
 * The osculating ellipse through r with velocity v (au, au/day) about μ (au³/day²),
 * starting at r. Null for an unbound (parabolic or hyperbolic) state. Also used for an
 * object looked up at JPL (#145), about the Sun.
 */
export function osculatingLoop(
  r: Vec3,
  v: Vec3,
  mu: number,
  count = MOON_ORBIT_POINTS,
): Vec3[] | null {
  const h = cross(r, v)
  const hLen = len(h)
  const rLen = len(r)
  if (hLen === 0 || rLen === 0) return null
  const eVec = sub(scale(cross(v, h), 1 / mu), scale(r, 1 / rLen))
  const e = len(eVec)
  const p = (hLen * hLen) / mu
  if (e >= 1) return null
  // Periapsis direction; for a near-circle, any direction in the plane (r itself) will do.
  const P = e > 1e-9 ? scale(eVec, 1 / e) : scale(r, 1 / rLen)
  const Q = scale(cross(h, P), 1 / hLen)
  // Start at the moon's own true anomaly, so its position is the loop's first vertex.
  const nuNow = Math.atan2(dot(r, Q), dot(r, P))
  const points: Vec3[] = []
  for (let i = 0; i < count; i += 1) {
    const nu = nuNow + (i / count) * 2 * Math.PI
    const rad = p / (1 + e * Math.cos(nu))
    const c = Math.cos(nu) * rad
    const s = Math.sin(nu) * rad
    points.push({ x: P.x * c + Q.x * s, y: P.y * c + Q.y * s, z: P.z * c + Q.z * s })
  }
  return points
}

/** The moon's orbit line for a date, or null when no data covers the date. */
export function moonOrbit(body: MoonBody, jd: number): MoonOrbit | null {
  const now = moonRelative(body, jd)
  const span = window(body)
  if (!now || !span) return null
  const period = body.periodDays
  const step = period / MOON_ORBIT_POINTS
  if (span.to - span.from >= period) {
    // One period around the date, slid to stay inside the window, on a grid through the
    // date itself: the moon sits on a vertex, never on a chord.
    const ideal = Math.min(Math.max(jd - period / 2, span.from), span.to - period + step)
    let from = jd - Math.round((jd - ideal) / step) * step
    if (from < span.from) from += step
    if (from + (MOON_ORBIT_POINTS - 1) * step > span.to) from -= step
    const points: Vec3[] = []
    for (let i = 0; i < MOON_ORBIT_POINTS; i += 1) {
      const s = moonRelative(body, from + i * step)
      if (s) points.push(s.position)
    }
    if (points.length === MOON_ORBIT_POINTS) return { kind: 'sampled', points }
  }
  const aAu = body.semiMajorAxisKm / AU_KM
  const mu = (4 * Math.PI * Math.PI * aAu ** 3) / (period * period)
  const points = osculatingLoop(now.position, now.velocity, mu)
  return points ? { kind: 'osculating', points } : null
}
