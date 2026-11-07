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
/** Scene units per decade of distance in place3d. */
export const LOG_SCALE_K = 10
/**
 * Where place3d's log scale bends: nearly linear inside a few au, logarithmic beyond. At
 * 0.1 au Jupiter landed only 1.4x Mars's radius, so the Inner view could not fill with
 * Mars's orbit without Jupiter's crossing the corners of a wide stage; at 3 au it is
 * 2.2x (tests/unit/orrery-framing.test.ts), and Neptune to Voyager 1 still fit 200 au.
 */
export const LOG_SCALE_R0_AU = 3

export interface Vec3 {
  readonly x: number
  readonly y: number
  readonly z: number
}

/**
 * The 3D orrery's placement (#91): keep the direction, compress the distance as
 * r′ = k·log10(1 + r/r0), so Mercury and Voyager 1 (172 au) fit one scene. Input is
 * ecliptic J2000 (x to the equinox, z to the ecliptic north pole); output is three.js
 * scene space, which is y-up, so ecliptic z becomes scene y and ecliptic y becomes −z.
 */
export function place3d(pos: Vec3, k = LOG_SCALE_K, r0 = LOG_SCALE_R0_AU): Vec3 {
  const r = Math.hypot(pos.x, pos.y, pos.z)
  if (r === 0) return { x: 0, y: 0, z: 0 }
  const s = (k * Math.log10(1 + r / r0)) / r
  return { x: pos.x * s, y: pos.z * s, z: pos.y === 0 ? 0 : -pos.y * s }
}

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
