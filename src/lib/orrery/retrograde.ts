/**
 * Retrograde loops (#159): when a planet seems to drift backwards against the stars, found
 * from the orrery's own planet maths (JPL's approximate elements), so the guide's Mars
 * lesson names dates the scene really shows. Checked against JPL Horizons in
 * tests/unit/orrery-guide-facts.test.ts.
 *
 * "Seen from Earth" means the heliocentric ecliptic vector of the planet minus Earth's.
 * The orrery's Earth is the Earth–Moon barycentre (JPL Table 1), about 4,700 km from the
 * real Earth: far below what a day's longitude change can show.
 */
import { heliocentric, type PlanetName } from './index'

const DEG = 180 / Math.PI
const STEP_DAYS = 0.5

const wrap360 = (d: number) => ((d % 360) + 360) % 360
const wrap180 = (d: number) => wrap360(d + 180) - 180

/** The planet's ecliptic longitude as seen from Earth's centre, degrees in [0, 360). */
export function geocentricLongitudeDeg(planet: PlanetName, jd: number): number {
  const p = heliocentric(planet, jd)
  const e = heliocentric('Earth', jd)
  return wrap360(Math.atan2(p.y - e.y, p.x - e.x) * DEG)
}

/** The Sun's ecliptic longitude seen from Earth: opposite Earth's from the Sun. */
function sunLongitudeDeg(jd: number): number {
  const e = heliocentric('Earth', jd)
  return wrap360(Math.atan2(-e.y, -e.x) * DEG)
}

/** Longitude change over one day, degrees; negative while the planet drifts backwards. */
const dailyMotion = (planet: PlanetName, jd: number) =>
  wrap180(geocentricLongitudeDeg(planet, jd + 0.5) - geocentricLongitudeDeg(planet, jd - 0.5))

export interface RetrogradeLoop {
  /** Julian dates (TDB) when the drift turns backwards and when it turns forward again. */
  readonly startJd: number
  readonly endJd: number
  /** The planet opposite the Sun in Earth's sky, midway through the loop. */
  readonly oppositionJd: number
}

/** The Julian date where `f` changes sign between a and b, by bisection. */
function bisect(f: (jd: number) => number, a: number, b: number): number {
  let lo = a
  let hi = b
  const flo = f(lo)
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2
    if (Math.sign(f(mid)) === Math.sign(flo)) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/**
 * The first retrograde loop between two Julian dates, or null if the planet only moves
 * forward there (or the window cuts the loop off).
 */
export function findRetrograde(
  planet: PlanetName,
  fromJd: number,
  toJd: number,
): RetrogradeLoop | null {
  let start: number | null = null
  let prevJd = fromJd
  let prev = dailyMotion(planet, prevJd)
  for (let jd = fromJd + STEP_DAYS; jd <= toJd; jd += STEP_DAYS) {
    const cur = dailyMotion(planet, jd)
    if (start === null && prev >= 0 && cur < 0) {
      start = bisect((t) => dailyMotion(planet, t), prevJd, jd)
    } else if (start !== null && prev < 0 && cur >= 0) {
      const end = bisect((t) => dailyMotion(planet, t), prevJd, jd)
      const opposition = bisect(
        (t) => wrap180(geocentricLongitudeDeg(planet, t) - sunLongitudeDeg(t) - 180),
        start,
        end,
      )
      return { startJd: start, endJd: end, oppositionJd: opposition }
    }
    prevJd = jd
    prev = cur
  }
  return null
}
