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
