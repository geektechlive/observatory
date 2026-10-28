/**
 * "Tonight, from here" (#78): how dark it gets and where the Moon is, hour by hour, at
 * the user's location. Low-precision positions from the Astronomical Almanac: the Sun
 * to about 0.01°, the Moon to a fraction of a degree (geocentric; topocentric parallax,
 * up to ~1° near the horizon, is ignored). Pure: callers pass the time.
 */

const RAD = Math.PI / 180
const DEG = 180 / Math.PI
const HOUR_MS = 3_600_000
export const STRIP_HOURS = 12

const sin = (deg: number) => Math.sin(deg * RAD)
const cos = (deg: number) => Math.cos(deg * RAD)

/** Days since J2000.0 (2000-01-01 12:00 TT, treated as UT here). */
function daysSinceJ2000(date: Date): number {
  return date.getTime() / 86_400_000 + 2440587.5 - 2451545.0
}

/** Greenwich mean sidereal time, degrees. */
function gmst(n: number): number {
  return 280.46061837 + 360.98564736629 * n
}

/** Altitude (degrees) of a body at right ascension / declination (degrees). */
function altitude(date: Date, lat: number, lon: number, ra: number, dec: number): number {
  const hourAngle = gmst(daysSinceJ2000(date)) + lon - ra
  return Math.asin(sin(lat) * sin(dec) + cos(lat) * cos(dec) * cos(hourAngle)) * DEG
}

/** Equatorial coordinates (degrees) from ecliptic longitude/latitude and obliquity. */
function toEquatorial(lambda: number, beta: number, eps: number): { ra: number; dec: number } {
  const ra = Math.atan2(sin(lambda) * cos(eps) - Math.tan(beta * RAD) * sin(eps), cos(lambda))
  const dec = Math.asin(sin(beta) * cos(eps) + cos(beta) * sin(eps) * sin(lambda))
  return { ra: ra * DEG, dec: dec * DEG }
}

/** The Sun's altitude in degrees, without refraction. */
export function sunAltitude(date: Date, lat: number, lon: number): number {
  const n = daysSinceJ2000(date)
  const meanLon = 280.46 + 0.9856474 * n
  const anomaly = 357.528 + 0.9856003 * n
  const lambda = meanLon + 1.915 * sin(anomaly) + 0.02 * sin(2 * anomaly)
  const eps = 23.439 - 0.0000004 * n
  const { ra, dec } = toEquatorial(lambda, 0, eps)
  return altitude(date, lat, lon, ra, dec)
}

/** The Moon's geocentric altitude in degrees. */
export function moonAltitude(date: Date, lat: number, lon: number): number {
  const n = daysSinceJ2000(date)
  const t = n / 36525
  const lambda =
    218.32 +
    481267.881 * t +
    6.29 * sin(135.0 + 477198.87 * t) -
    1.27 * sin(259.3 - 413335.36 * t) +
    0.66 * sin(235.7 + 890534.22 * t) +
    0.21 * sin(269.9 + 954397.74 * t) -
    0.19 * sin(357.5 + 35999.05 * t) -
    0.11 * sin(186.5 + 966404.03 * t)
  const beta =
    5.13 * sin(93.3 + 483202.02 * t) +
    0.28 * sin(228.2 + 960400.89 * t) -
    0.28 * sin(318.3 + 6003.15 * t) -
    0.17 * sin(217.6 - 407332.21 * t)
  const eps = 23.439 - 0.0000004 * n
  const { ra, dec } = toEquatorial(lambda, beta, eps)
  return altitude(date, lat, lon, ra, dec)
}

export type Darkness = 'day' | 'civil' | 'nautical' | 'astronomical' | 'dark'

/**
 * Twilight by the Sun's altitude. Above -0.833° (the upper limb plus refraction) the
 * Sun is up; below -18° the sky is fully dark, which is what faint aurora needs.
 */
export function darkness(sunAlt: number): Darkness {
  if (sunAlt > -0.833) return 'day'
  if (sunAlt > -6) return 'civil'
  if (sunAlt > -12) return 'nautical'
  if (sunAlt > -18) return 'astronomical'
  return 'dark'
}

const STEP_MS = 5 * 60_000
const DARK_BELOW = -18

/**
 * The current or next fully dark period (Sun below -18°) within a day, to 5 minutes;
 * null where it never gets fully dark (high latitudes around midsummer).
 */
export function darkWindow(now: Date, lat: number, lon: number): { start: Date; end: Date } | null {
  const isDark = (t: number) => sunAltitude(new Date(t), lat, lon) <= DARK_BELOW
  /** Bisect the step [a, b] where darkness changes, to under a minute. */
  const edge = (a: number, b: number) => {
    const darkAtA = isDark(a)
    let lo = a
    let hi = b
    while (hi - lo > 30_000) {
      const mid = (lo + hi) / 2
      if (isDark(mid) === darkAtA) lo = mid
      else hi = mid
    }
    return Math.round(hi)
  }
  const t0 = now.getTime()
  const limit = t0 + 24 * HOUR_MS
  let start: number | null = isDark(t0) ? t0 : null
  for (let t = t0 + STEP_MS; start === null && t <= limit; t += STEP_MS) {
    if (isDark(t)) start = edge(t - STEP_MS, t)
  }
  if (start === null) return null
  let step = start
  while (step <= start + 24 * HOUR_MS && isDark(step + STEP_MS)) step += STEP_MS
  return { start: new Date(start), end: new Date(edge(step, step + STEP_MS)) }
}

export interface TonightSlot {
  time: Date
  sunAlt: number
  darkness: Darkness
  moonAlt: number
  moonUp: boolean
}

/** Hourly slots from the start of the current local hour, `STRIP_HOURS` long. */
export function tonightStrip(now: Date, lat: number, lon: number): TonightSlot[] {
  const start = new Date(now)
  start.setMinutes(0, 0, 0)
  return Array.from({ length: STRIP_HOURS }, (_, i) => {
    const time = new Date(start.getTime() + i * HOUR_MS)
    const sunAlt = sunAltitude(time, lat, lon)
    const moonAlt = moonAltitude(time, lat, lon)
    return { time, sunAlt, darkness: darkness(sunAlt), moonAlt, moonUp: moonAlt > 0 }
  })
}
