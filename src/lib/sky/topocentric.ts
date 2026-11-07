/**
 * Where a sampled object stands in the user's sky (#99, spec Parts 4 and 17).
 *
 * Horizons' heliocentric ecliptic J2000 vectors minus Earth's (JPL's Table 1 Earth–Moon
 * barycentre, up to 4,700 km from Earth's centre: under 10" for an object an au away),
 * corrected for light time, turned to the equator of J2000, precessed to the date
 * (IAU 1976), turned with the Earth by mean sidereal time, then seen from the observer
 * on the WGS84 ellipsoid, so the parallax is exact rather than ignored. Left out:
 * nutation (up to 17"), annual aberration (up to 20"), the equation of the equinoxes
 * (about 1 s of time) and refraction. Together under 0.02°, checked against Horizons'
 * observer table in tests/unit/sky-topocentric.test.ts.
 */
import { stateAt } from '@/lib/orrery/ephemeris'
import { heliocentric, jdFromDate } from '@/lib/orrery/kepler'
import { AU_KM, C_KM_S } from '@/lib/orrery/units'
import { gmstAt } from '@/lib/tonight'
import type { SampledSpan } from '@/schemas/orreryBodies'

export interface Vec3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

export interface Observer {
  /** Geodetic latitude and east longitude, degrees; height above the ellipsoid, km. */
  lat: number
  lon: number
  heightKm?: number
}

export interface AltAz {
  /** Degrees above the horizon, no refraction. */
  altitude: number
  /** Degrees from north through east, [0, 360). */
  azimuth: number
}

/** The spans a body's vectors come in, as the orrery payloads carry them. */
export interface Sampled {
  fine: SampledSpan | null
  coarse: SampledSpan | null
}

const RAD = Math.PI / 180
const ARCSEC = RAD / 3600
/** J2000 obliquity of the ecliptic (IAU 1976), degrees. */
const OBLIQUITY_J2000 = 23.4392911
const J2000 = 2451545.0
/** TT − UTC since 2017 (37 leap seconds + 32.184 s); TDB differs from TT by < 2 ms. */
const TT_MINUS_UTC_DAYS = 69.184 / 86_400
const WGS84_A = 6378.137
const WGS84_F = 1 / 298.257223563
const WGS84_E2 = WGS84_F * (2 - WGS84_F)
const LIGHT_DAY_AU = (C_KM_S * 86_400) / AU_KM

/** A point on (or above) the WGS84 ellipsoid in Earth-fixed coordinates, km. */
export function wgs84ToEcef(latDeg: number, lonDeg: number, heightKm: number): Vec3 {
  const lat = latDeg * RAD
  const lon = lonDeg * RAD
  const n = WGS84_A / Math.sqrt(1 - WGS84_E2 * Math.sin(lat) ** 2)
  return {
    x: (n + heightKm) * Math.cos(lat) * Math.cos(lon),
    y: (n + heightKm) * Math.cos(lat) * Math.sin(lon),
    z: (n * (1 - WGS84_E2) + heightKm) * Math.sin(lat),
  }
}

/** Altitude and azimuth of an Earth-fixed point (km) from the observer, via east-north-up. */
export function altAzFromEcef(target: Vec3, observer: Observer): AltAz {
  const o = wgs84ToEcef(observer.lat, observer.lon, observer.heightKm ?? 0)
  const dx = target.x - o.x
  const dy = target.y - o.y
  const dz = target.z - o.z
  const lat = observer.lat * RAD
  const lon = observer.lon * RAD
  const east = -Math.sin(lon) * dx + Math.cos(lon) * dy
  const north =
    -Math.sin(lat) * Math.cos(lon) * dx - Math.sin(lat) * Math.sin(lon) * dy + Math.cos(lat) * dz
  const up =
    Math.cos(lat) * Math.cos(lon) * dx + Math.cos(lat) * Math.sin(lon) * dy + Math.sin(lat) * dz
  const azimuth = (((Math.atan2(east, north) / RAD) % 360) + 360) % 360
  return { altitude: Math.atan2(up, Math.hypot(east, north)) / RAD, azimuth }
}

/** Ecliptic of J2000 to the equator of J2000. */
export function eclipticToEquatorial(v: Vec3): Vec3 {
  const c = Math.cos(OBLIQUITY_J2000 * RAD)
  const s = Math.sin(OBLIQUITY_J2000 * RAD)
  return { x: v.x, y: c * v.y - s * v.z, z: s * v.y + c * v.z }
}

/** The equator and equinox of J2000 to the mean equator and equinox of a date (IAU 1976). */
export function precessToDate(v: Vec3, jd: number): Vec3 {
  const t = (jd - J2000) / 36_525
  const zeta = (2306.2181 * t + 0.30188 * t * t + 0.017998 * t ** 3) * ARCSEC
  const z = (2306.2181 * t + 1.09468 * t * t + 0.018203 * t ** 3) * ARCSEC
  const theta = (2004.3109 * t - 0.42665 * t * t - 0.041833 * t ** 3) * ARCSEC
  const [cz, sz] = [Math.cos(z), Math.sin(z)]
  const [ct, st] = [Math.cos(theta), Math.sin(theta)]
  const [cZ, sZ] = [Math.cos(zeta), Math.sin(zeta)]
  return {
    x: (cz * ct * cZ - sz * sZ) * v.x + (-cz * ct * sZ - sz * cZ) * v.y - cz * st * v.z,
    y: (sz * ct * cZ + cz * sZ) * v.x + (-sz * ct * sZ + cz * cZ) * v.y - sz * st * v.z,
    z: st * cZ * v.x - st * sZ * v.y + ct * v.z,
  }
}

/** Julian date (TDB) of a UTC moment. */
const jdTdb = (date: Date) => jdFromDate(date) + TT_MINUS_UTC_DAYS

/**
 * Geocentric astrometric direction of a sampled body, equator of J2000, au: where it was
 * when the light now arriving left it. Null outside its spans (never extrapolated).
 */
export function equatorialJ2000(body: Sampled, date: Date): Vec3 | null {
  const jd = jdTdb(date)
  const earth = heliocentric('Earth', jd)
  let lightDays = 0
  let rel: Vec3 | null = null
  // Two passes settle light time to well under a second for anything in the solar system.
  for (let pass = 0; pass < 3; pass += 1) {
    const state = stateAt(body, jd - lightDays)
    if (!state) return null
    const p = state.position
    rel = { x: p.x - earth.x, y: p.y - earth.y, z: p.z - earth.z }
    lightDays = Math.hypot(rel.x, rel.y, rel.z) / LIGHT_DAY_AU
  }
  return rel ? eclipticToEquatorial(rel) : null
}

/** A geocentric equatorial-of-date vector (au) as an Earth-fixed point (km), by mean sidereal time. */
function toEcef(v: Vec3, date: Date): Vec3 {
  const g = (gmstAt(date) % 360) * RAD
  return {
    x: (Math.cos(g) * v.x + Math.sin(g) * v.y) * AU_KM,
    y: (-Math.sin(g) * v.x + Math.cos(g) * v.y) * AU_KM,
    z: v.z * AU_KM,
  }
}

export interface SkyPosition extends AltAz {
  /** Distances from Earth and from the Sun, au, for the magnitude law. */
  delta: number
  r: number
}

/** Where a sampled body stands in the observer's sky at a moment, or null without data. */
export function topocentric(body: Sampled, date: Date, observer: Observer): SkyPosition | null {
  const j2000 = equatorialJ2000(body, date)
  if (!j2000) return null
  const jd = jdTdb(date)
  const look = altAzFromEcef(toEcef(precessToDate(j2000, jd), date), observer)
  const sun = stateAt(body, jd)
  const r = sun ? Math.hypot(sun.position.x, sun.position.y, sun.position.z) : Number.NaN
  return { ...look, delta: Math.hypot(j2000.x, j2000.y, j2000.z), r }
}
