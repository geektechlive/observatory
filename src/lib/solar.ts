// Pure solar / spherical geometry helpers for the globe overlays.
// No dependencies, no Date.now() side effects (callers pass the Date) so these
// stay unit-testable and deterministic.

const DEG = 180 / Math.PI
const RAD = Math.PI / 180
const EARTH_RADIUS_KM = 6371

export interface LatLon {
  lat: number
  lon: number
}

/** Normalize a longitude into [-180, 180]. */
export function normalizeLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180
}

/**
 * Subsolar point — the lat/lon where the Sun is directly overhead.
 * Declination via the standard cosine approximation; longitude from UTC time
 * of day (good to ~1°, ample for a day/night overlay).
 */
export function subsolarPoint(date: Date): LatLon {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0)
  const dayOfYear = Math.floor((date.getTime() - start) / 86400000)
  const declination = -23.44 * Math.cos(RAD * ((360 / 365) * (dayOfYear + 10)))

  const msOfDay =
    date.getUTCHours() * 3600000 +
    date.getUTCMinutes() * 60000 +
    date.getUTCSeconds() * 1000 +
    date.getUTCMilliseconds()
  const lon = normalizeLon(180 - (msOfDay / 86400000) * 360)

  return { lat: declination, lon }
}

/**
 * Ring of [lat, lon] points at a fixed angular distance (degrees) from a center.
 * Used for the day/night terminator (radius 90°) and the ISS visibility
 * footprint. Returns `n` points tracing the full small circle.
 */
export function smallCircleRing(
  centerLat: number,
  centerLon: number,
  angularRadiusDeg: number,
  n = 96,
): [number, number][] {
  const lat0 = centerLat * RAD
  const lon0 = centerLon * RAD
  const d = angularRadiusDeg * RAD
  const sinLat0 = Math.sin(lat0)
  const cosLat0 = Math.cos(lat0)
  const sinD = Math.sin(d)
  const cosD = Math.cos(d)

  const points: [number, number][] = []
  for (let i = 0; i <= n; i++) {
    const brng = (i / n) * 2 * Math.PI
    const sinLat = sinLat0 * cosD + cosLat0 * sinD * Math.cos(brng)
    const lat = Math.asin(Math.min(1, Math.max(-1, sinLat)))
    const lon = lon0 + Math.atan2(Math.sin(brng) * sinD * cosLat0, cosD - sinLat0 * Math.sin(lat))
    points.push([lat * DEG, normalizeLon(lon * DEG)])
  }
  return points
}

/**
 * Angular radius (degrees) of the ground area from which a satellite at
 * `altKm` is above the horizon: acos(Re / (Re + alt)).
 */
export function horizonRadiusDeg(altKm: number): number {
  const ratio = EARTH_RADIUS_KM / (EARTH_RADIUS_KM + Math.max(0, altKm))
  return Math.acos(Math.min(1, Math.max(-1, ratio))) * DEG
}
