/**
 * Putting the solar system on a screen (#90). Neptune is 77 times farther out than
 * Mercury, so one linear scale can't show both: the SYSTEM view uses a square root
 * (Mercury lands about a tenth of the way out), the INNER view a linear one where
 * eccentricity reads true. Anything beyond the frame goes on its rim.
 */

/** A radial scale: distance from the Sun (au) to distance from the centre (px). */
export type RadialScale = (au: number, maxAu: number, radius: number) => number

export const sqrtScale: RadialScale = (au, maxAu, radius) => radius * Math.sqrt(au / maxAu)

export const linearScale: RadialScale = (au, maxAu, radius) => radius * (au / maxAu)

export interface Placed {
  /** Screen offset from the Sun, px. Ecliptic +y; an SVG caller flips it. */
  readonly x: number
  readonly y: number
  /** Beyond the frame: drawn on the rim in its true direction. */
  readonly onRim: boolean
  /** True distance from the Sun in 3D, au, for the label. */
  readonly distanceAu: number
}

/**
 * Where a heliocentric position goes on screen, seen from above the ecliptic: its
 * direction is kept and its distance in the ecliptic plane is scaled. Past `maxAu` it
 * sits on the rim.
 */
export function place(
  pos: { x: number; y: number; z: number },
  scale: RadialScale,
  maxAu: number,
  radius: number,
): Placed {
  const inPlane = Math.hypot(pos.x, pos.y)
  const angle = Math.atan2(pos.y, pos.x)
  const onRim = inPlane > maxAu
  const r = onRim ? radius : scale(inPlane, maxAu, radius)
  return {
    x: r * Math.cos(angle),
    y: r * Math.sin(angle),
    onRim,
    distanceAu: Math.hypot(pos.x, pos.y, pos.z),
  }
}
