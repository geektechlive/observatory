/**
 * Units for the orrery (#91), per Chris's spec Part 6: canonical values stored, rounding
 * only for display. The lunar distance is the nominal conversion unit, not the Moon's
 * actual distance on a given day.
 */

/** IAU 2012 astronomical unit, km. */
export const AU_KM = 149_597_870.7
/** Nominal lunar distance, km. */
export const LD_KM = 384_400
/** Speed of light, km/s. */
export const C_KM_S = 299_792.458
/** Statute miles per km. */
export const KM_TO_MI = 0.6213711922

/**
 * Where Voyager 1 crossed the heliopause, au: an approximate marker, since the boundary
 * is not a sphere and moves. NASA/JPL (2013-09-12 release, "NASA Spacecraft Embarks on
 * Historic Journey Into Interstellar Space") give the crossing as Aug. 25, 2012; JPL
 * Horizons puts Voyager 1 at 121.60 au from the Sun that day (checked 2026-11-07).
 */
export const HELIOPAUSE_V1_AU = 121.6
/** The ring's label in the orrery: approximate, and says so. */
export const HELIOPAUSE_LABEL = 'Heliopause ≈ 122 au · approx.'

/** One-way light travel time over a distance, seconds. */
export function lightTimeSeconds(km: number): number {
  return km / C_KM_S
}

/** "8 min 19 s", "4 h 12 min", "30 s". */
export function formatLightTime(seconds: number): string {
  const s = Math.round(seconds)
  if (s < 60) return `${String(s)} s`
  if (s < 3600) return `${String(Math.floor(s / 60))} min ${String(s % 60)} s`
  const h = Math.floor(s / 3600)
  return `${String(h)} h ${String(Math.round((s % 3600) / 60))} min`
}
