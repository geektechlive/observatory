/**
 * Motion between two bodies (#91, spec Part 5.10): the range rate, how fast the gap is
 * changing. Negative means approaching, positive receding. It says nothing about a
 * collision. From central differences of the separation, so any position function works.
 */
import type { Vec3 } from './scale'
import { AU_KM } from './units'

/** Half-step for the central difference, days. An hour keeps Mercury's curve negligible. */
const HALF_STEP_DAYS = 1 / 24
const SECONDS_PER_DAY = 86_400

const gap = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

/** Range rate of `object` seen from `reference` at a Julian date, km/s. Positions in au. */
export function rangeRateKmS(
  object: (jd: number) => Vec3,
  reference: (jd: number) => Vec3,
  jd: number,
): number {
  const before = gap(object(jd - HALF_STEP_DAYS), reference(jd - HALF_STEP_DAYS))
  const after = gap(object(jd + HALF_STEP_DAYS), reference(jd + HALF_STEP_DAYS))
  return ((after - before) * AU_KM) / (2 * HALF_STEP_DAYS * SECONDS_PER_DAY)
}
