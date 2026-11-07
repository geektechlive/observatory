/**
 * Heliocentric planet positions (#90), following JPL's own recipe for its approximate
 * elements (https://ssd.jpl.nasa.gov/planets/approx_pos.html). Within 1800–2050 JPL
 * puts the error at 10–600 arcsec in longitude depending on the planet: far below a
 * pixel on any orrery we draw. Pure: callers pass the date.
 */
import {
  ELEMENTS,
  ELEMENTS_T2,
  EXTRA_T2,
  type PlanetName,
  VALID_FROM_JD,
  VALID_T2_FROM_JD,
  VALID_T2_TO_JD,
  VALID_TO_JD,
} from './elements'

const RAD = Math.PI / 180
const DEG = 180 / Math.PI
const J2000 = 2451545.0
const DAYS_PER_CENTURY = 36525
/** JPL's tolerance for the approximate formulae, degrees. */
const TOLERANCE_DEG = 1e-6
const MAX_ITERATIONS = 50

export interface Heliocentric {
  /** Ecliptic and equinox of J2000, au. x points to the equinox. */
  readonly x: number
  readonly y: number
  readonly z: number
  /** Which JPL table: 1 inside 1800–2050, 2 (3000 BC – 3000 AD) outside it (#91). */
  readonly table: 1 | 2
  /** Outside 3000 BC – 3000 AD, where no table is valid. Still computed. */
  readonly outOfRange: boolean
}

/**
 * Julian date of a moment. The elements want TDB, which runs about 69 s ahead of UTC;
 * Mercury, the fastest, moves ~0.003° in that time, so the difference is ignored.
 */
export function jdFromDate(date: Date): number {
  return date.getTime() / 86_400_000 + 2440587.5
}

/** Wraps an angle into [-180, 180] degrees. */
function wrap180(deg: number): number {
  return deg - 360 * Math.round(deg / 360)
}

/**
 * Eccentric anomaly E (degrees) from Kepler's equation M = E - e* sin E, by JPL's Newton
 * iteration with e* = e in degrees. M in degrees.
 */
export function solveKepler(meanAnomalyDeg: number, e: number): number {
  const eStar = e * DEG
  let E = meanAnomalyDeg + eStar * Math.sin(meanAnomalyDeg * RAD)
  for (let i = 0; i < MAX_ITERATIONS; i += 1) {
    const dM = meanAnomalyDeg - (E - eStar * Math.sin(E * RAD))
    const dE = dM / (1 - e * Math.cos(E * RAD))
    E += dE
    if (Math.abs(dE) <= TOLERANCE_DEG) break
  }
  return E
}

/**
 * Where a planet is at a Julian date (TDB), heliocentric, in au. Table 1 inside
 * 1800–2050, where it is the more accurate; Table 2 (3000 BC – 3000 AD) outside it (#91).
 */
export function heliocentric(planet: PlanetName, jd: number): Heliocentric {
  const table: 1 | 2 = jd >= VALID_FROM_JD && jd <= VALID_TO_JD ? 1 : 2
  const el = table === 1 ? ELEMENTS[planet] : ELEMENTS_T2[planet]
  const T = (jd - J2000) / DAYS_PER_CENTURY
  const at = ([v, rate]: readonly [number, number]) => v + rate * T
  const a = at(el.a)
  const e = at(el.e)
  const I = at(el.I) * RAD
  const L = at(el.L)
  const peri = at(el.peri)
  const node = at(el.node)

  const omega = (peri - node) * RAD
  const Om = node * RAD
  // Table 2 adds b T² + c cos(fT) + s sin(fT) to M for Jupiter–Neptune; Table 1 needs none.
  const x = table === 2 ? EXTRA_T2[planet] : undefined
  const extra = x ? x.b * T * T + x.c * Math.cos(x.f * T * RAD) + x.s * Math.sin(x.f * T * RAD) : 0
  const E = solveKepler(wrap180(L - peri + extra), e) * RAD

  const xp = a * (Math.cos(E) - e)
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E)

  const cw = Math.cos(omega)
  const sw = Math.sin(omega)
  const cO = Math.cos(Om)
  const sO = Math.sin(Om)
  const cI = Math.cos(I)
  const sI = Math.sin(I)

  return {
    x: (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    y: (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    z: sw * sI * xp + cw * sI * yp,
    table,
    outOfRange: jd < VALID_T2_FROM_JD || jd > VALID_T2_TO_JD,
  }
}
