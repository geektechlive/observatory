/**
 * Orbit classes and launch order for the satellite browser (#158), from fields every
 * stored row already carries (mean motion, eccentricity, COSPAR id). Plain TypeScript
 * with no imports: the propagation worker computes them once per load.
 *
 * The thresholds are a common convention, not an official standard:
 * - low (LEO): 11.25 or more revolutions a day, a period of up to about 128 minutes;
 * - geostationary ring (GEO): about one revolution a day (0.9 to 1.1) on a near circle;
 * - high (HEO): an elongated orbit (eccentricity of 0.25 or more, Molniya-style), or
 *   slower than the geostationary ring;
 * - medium (MEO): everything between, GPS (two a day) among it.
 */
export const ORBIT_UNKNOWN = 0
export const ORBIT_LEO = 1
export const ORBIT_MEO = 2
export const ORBIT_GEO = 3
export const ORBIT_HEO = 4

export type OrbitClassCode =
  typeof ORBIT_UNKNOWN | typeof ORBIT_LEO | typeof ORBIT_MEO | typeof ORBIT_GEO | typeof ORBIT_HEO

const LEO_MIN_REV_PER_DAY = 11.25
const GEO_MIN_REV_PER_DAY = 0.9
const GEO_MAX_REV_PER_DAY = 1.1
const HEO_MIN_ECCENTRICITY = 0.25

/** The class of an orbit from its mean motion (revolutions a day) and eccentricity. */
export function orbitClassOf(meanMotion: number, eccentricity: number): OrbitClassCode {
  if (!Number.isFinite(meanMotion) || !Number.isFinite(eccentricity) || meanMotion <= 0) {
    return ORBIT_UNKNOWN
  }
  if (eccentricity >= HEO_MIN_ECCENTRICITY) return ORBIT_HEO
  if (meanMotion >= LEO_MIN_REV_PER_DAY) return ORBIT_LEO
  if (meanMotion < GEO_MIN_REV_PER_DAY) return ORBIT_HEO
  if (meanMotion <= GEO_MAX_REV_PER_DAY) return ORBIT_GEO
  return ORBIT_MEO
}

/**
 * A launch's sort key from a COSPAR id (`2026-100A`): year times 1000 plus the launch
 * number of that year, so a larger key is a later launch. 0 when it can't be read.
 */
export function launchOrder(cospar: string): number {
  const m = /^(\d{4})-(\d{3})/.exec(cospar)
  return m ? Number(m[1]) * 1000 + Number(m[2]) : 0
}
