/**
 * The orrery's satellites (#98), the rules that need no three.js: how the layer shows at
 * each camera distance from Earth, how often the worker runs, and where a position from
 * SGP4 lands in the Earth frame (earthFrame.ts).
 *
 * Distances are the camera's from Earth's centre in Earth radii as drawn, so they mean
 * the same whether the frame is fully open or Earth is still at its solar-system size,
 * and are taken across the stage's narrow side (`satViewDistance`), so a portrait phone
 * and a wide screen see the same number of Earth radii across at the same setting.
 * The plan's 12 / 40 / 150 R⊕ were moved out: at the orrery's 30° field of view, the
 * Earth orbit view needs about 31 R⊕ to hold the geostationary ring, and the points
 * should still be points there.
 */
import { EARTH_RADIUS_KM, earthFrameRadii } from './earthFrame'
import type { Vec3 } from './scale'

/**
 * The Earth orbit preset holds this many Earth radii (as drawn) around Earth: the
 * geostationary ring (6.6) with a margin.
 */
export const ORBIT_PRESET_RADII = 7.2

/**
 * The camera's distance from Earth as the narrow side of the stage sees it: on a portrait
 * stage the horizontal field of view is narrower by the aspect ratio, so Earth looks as
 * it would from that much nearer.
 */
export function satViewDistance(re: number, aspect: number): number {
  return re * Math.min(1, Math.max(0.1, aspect))
}

/** Camera distances from Earth, Earth radii as drawn. */
export const SAT_DISTANCE = {
  /** Points at full strength, pickable, worker every second. */
  pointsFull: 35,
  /** Points gone; between the two they fade and the worker runs every 2 s. */
  pointsGone: 80,
  /** Haze starts, and is at full strength by `hazeFull`. */
  hazeStart: 45,
  hazeFull: 90,
  /** Haze fades out from here to `hidden`, and nothing shows beyond it. */
  hazeFade: 150,
  hidden: 300,
} as const

/** A satellite's key in the scene, search and the inspector: `sat:<NORAD id>`. */
export const SAT_KEY_PREFIX = 'sat:'
export const satKey = (noradId: string) => `${SAT_KEY_PREFIX}${noradId}`
export const isSatKey = (key: string) => key.startsWith(SAT_KEY_PREFIX)
/** A ringed re-entry object's label in the scene (#154): `reentry:<NORAD id>`, apart from `sat:`. */
export const reentryKey = (noradId: string) => `reentry:${noradId}`
/** The ISS, always in search: choosing it opens the Earth orbit view and loads its group. */
export const ISS_NORAD_ID = '25544'

/** Above this playback rate (sim seconds per second) the satellites show as haze only. */
export const HAZE_ONLY_RATE = 60

const NEAR_CADENCE_MS = 1000
const MID_CADENCE_MS = 2000

export interface SatDisplay {
  /** Strength of the individual points, 0 to 1 (already scaled by the frame's openness). */
  pointsAlpha: number
  /** Strength of the haze, 0 to 1 (likewise). */
  hazeAlpha: number
  /** Whether a tap can pick a satellite. */
  pickable: boolean
  /** How often to run the worker, ms; null: don't (the last pass stays drawn). */
  cadenceMs: number | null
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
/** 1 at `a`, 0 at `b` (a < b), linear in log distance. */
const fallLog = (re: number, a: number, b: number) =>
  clamp01(1 - Math.log(re / a) / Math.log(b / a))

/**
 * How the satellites show for a camera `re` Earth radii from Earth, a clock running at
 * `rate`, and the Earth frame `openness` open (0 closed: nothing shows, nothing runs).
 */
export function satDisplay(re: number, rate: number, openness: number): SatDisplay {
  const d = SAT_DISTANCE
  const open = clamp01(openness)
  if (open === 0 || !(re <= d.hidden)) {
    return { pointsAlpha: 0, hazeAlpha: 0, pickable: false, cadenceMs: null }
  }
  const farFade = fallLog(re, d.hazeFade, d.hidden)
  if (Math.abs(rate) > HAZE_ONLY_RATE) {
    return { pointsAlpha: 0, hazeAlpha: open * farFade, pickable: false, cadenceMs: null }
  }
  const points = fallLog(re, d.pointsFull, d.pointsGone)
  const haze = (1 - fallLog(re, d.hazeStart, d.hazeFull)) * farFade
  const cadenceMs = points === 0 ? null : re <= d.pointsFull ? NEAR_CADENCE_MS : MID_CADENCE_MS
  return {
    pointsAlpha: points * open,
    // Never both at full strength: the haze makes up what the points have lost.
    hazeAlpha: Math.min(haze, 1 - points) * open,
    pickable: re <= d.pointsFull,
    cadenceMs,
  }
}

/** Row-major 3x3 matrix. */
export type Mat3 = readonly [number, number, number, number, number, number, number, number, number]

const RAD = Math.PI / 180
const ARCSEC = RAD / 3600

/**
 * TEME (SGP4's frame: Earth's equator and equinox of date) to the orrery's scene axes,
 * which are ecliptic J2000 (x, y, z) drawn as (x, z, −y), place3d's mapping.
 *
 * Equator of date to ecliptic of date by the mean obliquity, then back along the
 * ecliptic by the general precession in longitude since J2000 (IAU 2006, 5029.0966″ per
 * century: 0.375° by 2026). What is left out (nutation, under 0.006°; TEME's equinox
 * against the mean one; the ecliptic's own slow tilt) moves a GEO satellite by under
 * 5 km, far below a pixel at any zoom the orrery draws.
 */
export function temeToScene(jd: number): Mat3 {
  const t = (jd - 2_451_545) / 36_525
  const eps = (84_381.406 - 46.836769 * t) * ARCSEC
  const p = 5029.0966 * t * ARCSEC
  const ce = Math.cos(eps)
  const se = Math.sin(eps)
  const cp = Math.cos(p)
  const sp = Math.sin(p)
  // Ecliptic of date: (x, y cε + z sε, −y sε + z cε). Back by p about the ecliptic pole:
  // (x cp + y sp, −x sp + y cp, z). Then scene (x, z, −y).
  const ex = [cp, sp * ce, sp * se] as const
  const ey = [-sp, cp * ce, cp * se] as const
  const ez = [0, -se, ce] as const
  return [ex[0], ex[1], ex[2], ez[0], ez[1], ez[2], -ey[0], -ey[1], -ey[2]]
}

/** Greenwich mean sidereal time at a UTC Julian date, radians (IAU 1982, linear term). */
function gmstRad(jd: number): number {
  return (280.46061837 + 360.98564736629 * (jd - 2_451_545)) * RAD
}

/**
 * Earth's mapped skin to the scene (#138), row-major. The skin's own axes are the
 * texture's as SphereGeometry lays it out: +x at longitude 0, +y the north pole, −z at
 * 90° E. Greenwich turns with sidereal time inside TEME, and TEME goes to the scene by
 * temeToScene, so the map and the satellites share one frame and a satellite is drawn
 * over the place it is above.
 */
export function earthSkinToScene(jd: number): Mat3 {
  const g = gmstRad(jd)
  const c = Math.cos(g)
  const s = Math.sin(g)
  const [a, b, d, e, f, h, k, l, n] = temeToScene(jd)
  // The skin's axes in TEME: Greenwich (c, s, 0), the pole (0, 0, 1), −(90° E) (s, −c, 0).
  return [
    a * c + b * s,
    d,
    a * s - b * c,
    e * c + f * s,
    h,
    e * s - f * c,
    k * c + l * s,
    n,
    k * s - l * c,
  ]
}

/**
 * Where a satellite at TEME position `teme` (km) is drawn: around Earth's scene position
 * at the Earth frame's scale, Earth drawn `radius` scene units. The shader in
 * satLayer.ts does the same per point; this is for picking, the chosen satellite's
 * marker and the tests. Null when SGP4 gave no position.
 */
export function satScenePosition(
  teme: readonly [number, number, number],
  m: Mat3,
  earth: Vec3,
  radius: number,
): Vec3 | null {
  const [x, y, z] = teme
  const px = m[0] * x + m[1] * y + m[2] * z
  const py = m[3] * x + m[4] * y + m[5] * z
  const pz = m[6] * x + m[7] * y + m[8] * z
  const km = Math.hypot(px, py, pz)
  if (!(km > 0)) return null
  const k = (radius * earthFrameRadii(km)) / km
  return { x: earth.x + px * k, y: earth.y + py * k, z: earth.z + pz * k }
}

/**
 * Whether Earth (a sphere of `radius` at `earth`) hides `point` from `camera` (#140): the
 * sight line meets the sphere before it reaches the point. A camera inside Earth sees
 * everything; markers that skip the depth test use this to dim what is on the far side.
 */
export function behindEarth(point: Vec3, earth: Vec3, radius: number, camera: Vec3): boolean {
  const dx = point.x - camera.x
  const dy = point.y - camera.y
  const dz = point.z - camera.z
  const fx = camera.x - earth.x
  const fy = camera.y - earth.y
  const fz = camera.z - earth.z
  const a = dx * dx + dy * dy + dz * dz
  const c = fx * fx + fy * fy + fz * fz - radius * radius
  if (!(a > 0) || c <= 0) return false
  const b = 2 * (fx * dx + fy * dy + fz * dz)
  const disc = b * b - 4 * a * c
  if (disc < 0) return false
  const t = (-b - Math.sqrt(disc)) / (2 * a)
  return t > 0 && t < 1
}

/**
 * Whether a label should go faint because Earth hides what it names (#219): behindEarth,
 * except inside Earth's drawn sphere. There (the frame closed, a craft or approach at its
 * true place in an exaggerated Earth) the object is on Earth, not behind it.
 */
export function labelBehindEarth(point: Vec3, earth: Vec3, radius: number, camera: Vec3): boolean {
  const inside = Math.hypot(point.x - earth.x, point.y - earth.y, point.z - earth.z) <= radius
  return !inside && behindEarth(point, earth, radius, camera)
}

/** Height above Earth's mean radius, km. */
export function satAltitudeKm(teme: readonly [number, number, number]): number {
  return Math.hypot(teme[0], teme[1], teme[2]) - EARTH_RADIUS_KM
}

/** How far the orbit data's epoch is from the date shown, for the inspector. */
export function epochAgeText(epochMs: number, simMs: number): string {
  const hours = (simMs - epochMs) / 3_600_000
  const side = hours >= 0 ? 'before' : 'after'
  const h = Math.abs(hours)
  return h < 48
    ? `${String(Math.round(h))} h ${side} this date`
    : `${(h / 24).toFixed(1)} days ${side} this date`
}

/** The haze's point size, CSS px, on a stage at least `HAZE_FULL_STAGE_PX` across its narrow side. */
export const HAZE_PX = 7
const HAZE_FULL_STAGE_PX = 700
const HAZE_MIN_PX = 2

/**
 * The haze's point size for a stage `stagePx` CSS px across its narrow side (#139). The
 * shell shrinks with the stage but a fixed 7 px grain does not, so on a 390 px phone at
 * the Earth–Moon preset the haze drew a fat band through the asteroid labels. The grain
 * shrinks in step with the stage below 700 px, to no less than 2 px.
 */
export function satHazePx(stagePx: number): number {
  if (!(stagePx < HAZE_FULL_STAGE_PX)) return HAZE_PX
  return Math.max(HAZE_MIN_PX, (HAZE_PX * Math.max(0, stagePx)) / HAZE_FULL_STAGE_PX)
}

/** Earth's drawn radius, CSS px, at and above which the points are at full strength (#198). */
export const POINT_FULL_EARTH_PX = 200
/** Below this radius the fade has bottomed out. */
const POINT_FADE_START_PX = 20
/** The share of strength left when Earth is tiny: a hint of the shell, not a fur coat. */
const POINT_MIN_STRENGTH = 0.2

/**
 * How strongly the satellite points draw for Earth's size on screen, 0.2 to 1. Points are
 * a fixed 2 px, so at the Earth-Moon preset (Earth 30 to 57 px) 5,600 to 19,000 of them
 * bury the disc; a smoothstep from 20 px to 200 px thins them until Earth can carry them.
 */
export function satPointStrength(earthPx: number): number {
  if (!(earthPx < POINT_FULL_EARTH_PX)) return 1
  const t = Math.min(
    1,
    Math.max(0, (earthPx - POINT_FADE_START_PX) / (POINT_FULL_EARTH_PX - POINT_FADE_START_PX)),
  )
  const smooth = t * t * (3 - 2 * t)
  return POINT_MIN_STRENGTH + (1 - POINT_MIN_STRENGTH) * smooth
}
