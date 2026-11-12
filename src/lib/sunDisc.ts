/**
 * Where an SWPC active region sits on SDO's disc image (#210).
 *
 * SWPC gives heliographic latitude and longitude from the central meridian, valid at
 * 00:00 UTC. SDO's "latest" frames are north-up (checked against the 2026-11-12 HMI
 * magnetogram), so the only tilt to apply is B0, the solar equator's tilt toward Earth.
 * Each region is turned by the Sun's differential rotation from that time to the image's:
 * forward for a complete day, back for an early day's positions, which SWPC carries to the
 * end of the day (#213). Past two days that turn is too uncertain
 * (regions evolve), so no marker is drawn. Details: docs/reference/data-feeds-and-monitoring.md.
 */

const DEG = Math.PI / 180
const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
/** Unix ms of JD 2451545.0 (J2000.0). */
const J2000_MS = Date.UTC(2000, 0, 1, 12)
/** Longer than this between the positions and the image, and no marker is drawn. */
export const MAX_TURN_HOURS = 48

/**
 * SWPC's region summary comes out at 00:30 UTC with positions valid at 00:00, so a current
 * one is at most about 24.5 h old. Early reports for the new day are valid at its end, in
 * the future, until then (#213). Past this, SWPC hasn't issued anything newer.
 */
export const REGIONS_CURRENT_HOURS = 30

function hoursBetween(validAt: string, at: Date): number {
  return (at.getTime() - Date.parse(validAt)) / HOUR_MS
}

/** True when SWPC's positions are older than its daily summary should ever be. */
export function regionsOutOfDate(validAt: string, now: Date): boolean {
  return hoursBetween(validAt, now) > REGIONS_CURRENT_HOURS
}

/** True when the positions are too far from the image's time to turn honestly. */
export function tooOldToTurn(validAt: string, imageAt: Date): boolean {
  const hours = hoursBetween(validAt, imageAt)
  return !Number.isFinite(hours) || Math.abs(hours) > MAX_TURN_HOURS
}

/** Inclination of the solar equator to the ecliptic, and its node (Carrington). */
const SOLAR_I_DEG = 7.25

/** Solar radius at 1 AU, arcseconds (IAU nominal). */
const SUN_RADIUS_ARCSEC_1AU = 959.63
/** Frame half-width of SDO's latest_1024 images, px. */
const FRAME_HALF_PX = 512
/** Arcsec per pixel of the 1024 px frames: AIA is 0.6"/px at 4096, HMI 0.504"/px. */
const PLATE_ARCSEC_PER_PX = { aia: 2.4, hmi: 2.016 } as const

function daysSinceJ2000(at: Date): number {
  return (at.getTime() - J2000_MS) / DAY_MS
}

/** The Sun's apparent ecliptic longitude (deg) and distance (AU), low precision. */
function sunPosition(at: Date): { lambdaDeg: number; distanceAu: number } {
  const t = daysSinceJ2000(at) / 36525
  const l0 = 280.46646 + 36000.76983 * t
  const m = (357.52911 + 35999.05029 * t) * DEG
  const c =
    (1.914602 - 0.004817 * t) * Math.sin(m) +
    0.019993 * Math.sin(2 * m) +
    0.000289 * Math.sin(3 * m)
  const distanceAu = 1.000140612 - 0.016708617 * Math.cos(m) - 0.000139589 * Math.cos(2 * m)
  return { lambdaDeg: l0 + c, distanceAu }
}

/** B0: heliographic latitude of the disc centre, as seen from Earth (Meeus, ch. 29). */
export function solarB0Deg(at: Date): number {
  const jd = at.getTime() / DAY_MS + 2440587.5
  const k = 73.6667 + (1.3958333 * (jd - 2396758)) / 36525
  const { lambdaDeg } = sunPosition(at)
  return Math.asin(Math.sin((lambdaDeg - k) * DEG) * Math.sin(SOLAR_I_DEG * DEG)) / DEG
}

/**
 * Rotation rate seen from Earth at a latitude, deg/day: the sidereal rate of sunspots
 * (Snodgrass and Ulrich 1990, 14.713 - 2.396 sin^2 - 1.787 sin^4) less Earth's mean motion.
 */
export function synodicRateDegPerDay(latitudeDeg: number): number {
  const s2 = Math.sin(latitudeDeg * DEG) ** 2
  return 14.713 - 2.396 * s2 - 1.787 * s2 * s2 - 0.9856
}

/** The solar limb's radius as a share of the image's half-width, for one SDO wavelength. */
export function discRadiusShare(wavelength: string, at: Date): number {
  const plate = wavelength === 'HMIB' ? PLATE_ARCSEC_PER_PX.hmi : PLATE_ARCSEC_PER_PX.aia
  const radiusArcsec = SUN_RADIUS_ARCSEC_1AU / sunPosition(at).distanceAu
  return radiusArcsec / plate / FRAME_HALF_PX
}

export interface DiscPoint {
  /** Solar radii from the disc centre, west (right) positive. */
  x: number
  /** Solar radii from the disc centre, north (up) positive. */
  y: number
}

/**
 * A region's place on the disc at `imageAt`, or null when it has turned behind the limb
 * or the positions are too old to turn. `longitude` is SWPC's: east of the central
 * meridian is positive.
 */
export function regionOnDisc(
  region: { latitude: number; longitude: number },
  validAt: string,
  imageAt: Date,
): DiscPoint | null {
  if (tooOldToTurn(validAt, imageAt)) return null
  const hours = hoursBetween(validAt, imageAt)

  const lat = region.latitude * DEG
  const westDeg = -region.longitude + (synodicRateDegPerDay(region.latitude) * hours) / 24
  const west = westDeg * DEG
  const b0 = solarB0Deg(imageAt) * DEG

  const towardEarth = Math.sin(lat) * Math.sin(b0) + Math.cos(lat) * Math.cos(west) * Math.cos(b0)
  if (towardEarth <= 0) return null
  return {
    x: Math.cos(lat) * Math.sin(west),
    y: Math.sin(lat) * Math.cos(b0) - Math.cos(lat) * Math.cos(west) * Math.sin(b0),
  }
}
