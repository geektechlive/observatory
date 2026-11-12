// Two-body positions on any conic (#99): ellipses for periodic comets, and the
// parabolas and hyperbolas the spec's Part 5 leaves out, which long-period comets and
// the three interstellar objects need. Elements are heliocentric ecliptic J2000, as
// JPL's SBDB and Horizons headers give them; times are Julian dates (TDB).
//
// No imports and nothing but erasable syntax, so scripts/orrery-smallbodies.mjs can
// import it under Node's type stripping, like horizons.ts and craft.ts.

const RAD = Math.PI / 180
/** The Gaussian gravitational constant, au^1.5 / day: the Sun's √GM. */
const K = 0.01720209895
const KM_PER_AU = 149_597_870.7
const AU_PER_DAY_IN_KMS = KM_PER_AU / 86_400
/** Closer to 1 than this, the orbit is solved as a parabola. */
const PARABOLIC_BAND = 1e-9
const MAX_ITERATIONS = 100

export interface ConicElements {
  /** Eccentricity: < 1 ellipse, 1 parabola, > 1 hyperbola. */
  readonly e: number
  /** Perihelion distance, au. */
  readonly q: number
  /** Time of perihelion, Julian date (TDB). */
  readonly tp: number
  /** Longitude of the ascending node, argument of perihelion and inclination, degrees. */
  readonly om: number
  readonly w: number
  readonly i: number
}

export interface ConicPosition {
  /** Heliocentric ecliptic J2000, au. */
  readonly x: number
  readonly y: number
  readonly z: number
  /** Distance from the Sun, au. */
  readonly r: number
}

export interface Direction {
  readonly x: number
  readonly y: number
  readonly z: number
}

/**
 * E from M = E - e sin E (radians), by Newton from E0 = M below e = 0.8 and from π
 * above it, where a start at M can overshoot. M is wrapped into [-π, π) for the solve,
 * so the start is ±π on M's side, and the answer is shifted back by the same turns.
 * Wrapping into [0, 2π) instead turned a tiny negative M into 2π minus it and lost its
 * digits: a near-parabolic ellipse before perihelion came out 0.0002 au off.
 */
export function solveEllipticAnomaly(meanAnomaly: number, e: number): number {
  const turns = Math.round(meanAnomaly / (2 * Math.PI)) * 2 * Math.PI
  const M = meanAnomaly - turns
  let E = e < 0.8 ? M : M < 0 ? -Math.PI : Math.PI
  for (let k = 0; k < MAX_ITERATIONS; k += 1) {
    const dE = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
    E -= dE
    if (Math.abs(dE) <= 1e-15 * Math.max(1, Math.abs(E))) break
  }
  return E + turns
}

/** H from M = e sinh H - H, by Newton from Danby's start, sign(M) ln(2|M|/e + 1.8). */
export function solveHyperbolicAnomaly(meanAnomaly: number, e: number): number {
  const M = meanAnomaly
  let H = Math.sign(M) * Math.log((2 * Math.abs(M)) / e + 1.8)
  for (let k = 0; k < MAX_ITERATIONS; k += 1) {
    const dH = (e * Math.sinh(H) - H - M) / (e * Math.cosh(H) - 1)
    H -= dH
    if (Math.abs(dH) <= 1e-15 * Math.max(1, Math.abs(H))) break
  }
  return H
}

/**
 * D = tan(ν/2) from Barker's equation D + D³/3 = W, in closed form. Solved for |W| and
 * signed after, because A + √(A² + 1) loses its digits for large negative A.
 */
export function solveBarker(W: number): number {
  const A = 1.5 * Math.abs(W)
  const B = Math.cbrt(A + Math.sqrt(A * A + 1))
  return Math.sign(W) * (B - 1 / B)
}

/** Position in the orbit's own plane: perihelion on +x, motion towards +y. */
function perifocal(el: ConicElements, jd: number): { xp: number; yp: number; r: number } {
  const { e, q } = el
  const dt = jd - el.tp
  if (Math.abs(e - 1) < PARABOLIC_BAND) {
    const D = solveBarker(dt * K * Math.sqrt(1 / (2 * q * q * q)))
    return { xp: q * (1 - D * D), yp: 2 * q * D, r: q * (1 + D * D) }
  }
  if (e < 1) {
    const a = q / (1 - e)
    const E = solveEllipticAnomaly((K / Math.sqrt(a * a * a)) * dt, e)
    return {
      xp: a * (Math.cos(E) - e),
      yp: a * Math.sqrt(1 - e * e) * Math.sin(E),
      r: a * (1 - e * Math.cos(E)),
    }
  }
  const a = q / (e - 1)
  const H = solveHyperbolicAnomaly((K / Math.sqrt(a * a * a)) * dt, e)
  return {
    xp: a * (e - Math.cosh(H)),
    yp: a * Math.sqrt(e * e - 1) * Math.sinh(H),
    r: a * (e * Math.cosh(H) - 1),
  }
}

/** Turn a vector in the orbit's plane into the ecliptic frame (ω, then i, then Ω). */
function toEcliptic(el: ConicElements, xp: number, yp: number): Direction {
  const cw = Math.cos(el.w * RAD)
  const sw = Math.sin(el.w * RAD)
  const cO = Math.cos(el.om * RAD)
  const sO = Math.sin(el.om * RAD)
  const cI = Math.cos(el.i * RAD)
  const sI = Math.sin(el.i * RAD)
  return {
    x: (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    y: (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    z: sw * sI * xp + cw * sI * yp,
  }
}

/**
 * Where a body on these elements is at a Julian date (TDB): the two-body answer, with
 * no planets pulling and no outgassing. Near the elements' epoch it matches Horizons to
 * a few thousand km; years away a comet can drift by far more, which is why the
 * refresh job ships Horizons vectors as well.
 */
export function conicPosition(el: ConicElements, jd: number): ConicPosition {
  const { xp, yp, r } = perifocal(el, jd)
  return { ...toEcliptic(el, xp, yp), r }
}

/**
 * The point on the conic at true anomaly ν (radians), heliocentric ecliptic au. Any
 * shape: r = q(1 + e) / (1 + e cos ν). For drawing an orbit line, not for a date.
 */
export function conicPointAt(el: ConicElements, nu: number): ConicPosition {
  const r = (el.q * (1 + el.e)) / (1 + el.e * Math.cos(nu))
  return { ...toEcliptic(el, r * Math.cos(nu), r * Math.sin(nu)), r }
}

/** Points along an orbit line (#99). */
const PATH_SAMPLES = 360

export interface ConicPath {
  /** Heliocentric ecliptic au, in the direction of motion. */
  readonly points: readonly ConicPosition[]
  /** A whole ellipse inside the cut: the line closes on its first point. */
  readonly closed: boolean
}

/**
 * The orbit as a line (#99), sampled evenly in true anomaly, so the bend at perihelion
 * stays smooth. A bounded ellipse whose aphelion lies inside `maxR` (au) is closed;
 * anything else is the arc inside `maxR`: a near-parabolic comet's aphelion can be 1,600
 * au out, and a hyperbola runs to infinity. Nothing when the orbit never comes inside
 * `maxR` or the elements are not numbers.
 */
export function conicPath(el: ConicElements, maxR: number): ConicPath {
  const { e, q } = el
  const none: ConicPath = { points: [], closed: false }
  if (!(e >= 0) || !(q > 0) || !(maxR >= q)) return none
  const aphelion = e < 1 ? (q * (1 + e)) / (1 - e) : Number.POSITIVE_INFINITY
  if (aphelion <= maxR) {
    const points: ConicPosition[] = []
    for (let k = 0; k < PATH_SAMPLES; k += 1) {
      points.push(conicPointAt(el, -Math.PI + (2 * Math.PI * k) / PATH_SAMPLES))
    }
    return { points, closed: true }
  }
  const cosMax = Math.min(1, Math.max(-1, ((q * (1 + e)) / maxR - 1) / e))
  const nuMax = Math.acos(cosMax)
  const points: ConicPosition[] = []
  for (let k = 0; k <= PATH_SAMPLES; k += 1) {
    points.push(conicPointAt(el, -nuMax + (2 * nuMax * k) / PATH_SAMPLES))
  }
  return { points, closed: false }
}

/** The speed a hyperbolic body keeps far from the Sun, km/s; null for a bound orbit. */
export function vInfinityKms(el: { readonly e: number; readonly q: number }): number | null {
  if (el.e <= 1) return null
  return K * Math.sqrt((el.e - 1) / el.q) * AU_PER_DAY_IN_KMS
}

/**
 * The two asymptotes of a hyperbola, as unit vectors from the Sun: `inbound` is the
 * direction the body came from, `outbound` where it is heading.
 */
export function asymptoteDirections(el: ConicElements): {
  inbound: Direction
  outbound: Direction
} {
  if (el.e <= 1) throw new Error('asymptotes need e > 1')
  const nu = Math.acos(-1 / el.e)
  return {
    inbound: toEcliptic(el, Math.cos(nu), -Math.sin(nu)),
    outbound: toEcliptic(el, Math.cos(nu), Math.sin(nu)),
  }
}
