/**
 * How big the Sun is drawn, as a distance from its centre (#261). In the stretched scales
 * the Sun is drawn larger than life, so a craft that dives close to it (Parker Solar
 * Probe, 9.86 solar radii) has its path inside the drawn Sun; the inspector says so
 * rather than shrinking the Sun (the owner's choice, docs/reference/orrery.md).
 */
import { LOG_SCALE_K, LOG_SCALE_R0_AU } from './scale'

/** The scale modes, as the renderer names them (three/OrreryRenderer's ScaleMode). */
export type DrawnScale = 'exaggerated' | 'log' | 'proportional'

/** The Sun's radius in Big bodies, scene units. Inside Mercury's perihelion (0.42). */
export const EXAGGERATED_SUN_UNITS = 0.22
/** Log distance draws every body at this fraction of its Big bodies radius. */
export const LOG_SIZE_FACTOR = 0.45

/**
 * The distance from the Sun's centre, au, that place3d puts at the drawn Sun's edge, or
 * null where the Sun is drawn at its true size (Proportional).
 */
export function drawnSunAu(scale: DrawnScale): number | null {
  if (scale === 'proportional') return null
  const units = EXAGGERATED_SUN_UNITS * (scale === 'log' ? LOG_SIZE_FACTOR : 1)
  // place3d: r' = k·log10(1 + r/r0), inverted.
  return LOG_SCALE_R0_AU * (10 ** (units / LOG_SCALE_K) - 1)
}

/** The smallest distance from the Sun along a path, au, or null for no points. */
export function closestPassAu(
  points: readonly { readonly x: number; readonly y: number; readonly z: number }[],
): number | null {
  let min = Infinity
  for (const p of points) min = Math.min(min, Math.hypot(p.x, p.y, p.z))
  return Number.isFinite(min) ? min : null
}

/** Whether a closest pass falls inside the Sun as this scale draws it. */
export function insideDrawnSun(closestAu: number | null, scale: DrawnScale): boolean {
  const sun = drawnSunAu(scale)
  return closestAu !== null && sun !== null && closestAu < sun
}
