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
