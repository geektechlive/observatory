/**
 * Camera framing for the orrery's presets (#91). Each preset names an orbit that should
 * nearly fill the stage: the camera distance is found numerically so that orbit, seen
 * from the preset's elevation with perspective, fits `FILL` of the view on both axes for
 * the stage's actual aspect. Pure, so the tests can check what each preset shows.
 */
import { PerspectiveCamera, Vector3 } from 'three'

export type FocusPreset = 'sun' | 'inner' | 'outer' | 'heliosphere' | 'earth' | 'orbit'
/**
 * The presets framed around the Sun; Earth–Moon/L1 (#92) and Earth orbit (#98) are
 * framed on Earth instead.
 */
export type SunPreset = Exclude<FocusPreset, 'earth' | 'orbit'>

export interface PresetDef {
  /** The orbit (or distance) at the frame's edge, au. */
  edgeAu: number
  /** How far above the ecliptic the camera looks down, degrees. */
  elevationDeg: number
}

/**
 * Sun: out to Mercury's aphelion. Inner: Mars's aphelion. Outer: Neptune's aphelion.
 * Heliosphere: 200 au, past Voyager 1 (172 au in 2026). Steeper views for the inner
 * system keep the near side of Jupiter's orbit from swinging into frame.
 */
export const PRESETS: Readonly<Record<SunPreset, PresetDef>> = {
  sun: { edgeAu: 0.467, elevationDeg: 60 },
  inner: { edgeAu: 1.666, elevationDeg: 86 },
  outer: { edgeAu: 30.4, elevationDeg: 40 },
  heliosphere: { edgeAu: 200, elevationDeg: 30 },
}

export const FOV = 30
/** The edge orbit fills this share of the view (centre to edge). */
export const FILL = 0.88
const RING_SAMPLES = 72

/** Scene radius of a distance in au, under the current scale mode. */
export type ToSceneRadius = (au: number) => number

/** The largest |x| or |y| (NDC, 1 = view edge) of a ring of scene radius r in the ecliptic. */
export function ringExtent(camera: PerspectiveCamera, r: number): number {
  let max = 0
  const p = new Vector3()
  for (let i = 0; i < RING_SAMPLES; i += 1) {
    const a = (i / RING_SAMPLES) * Math.PI * 2
    p.set(r * Math.cos(a), 0, r * Math.sin(a)).project(camera)
    max = Math.max(max, Math.abs(p.x), Math.abs(p.y))
  }
  return max
}

/** The smallest |x| or |y| reach of a ring: if > 1, the whole ring is off screen. */
export function ringMinReach(camera: PerspectiveCamera, r: number): number {
  let min = Infinity
  const p = new Vector3()
  for (let i = 0; i < RING_SAMPLES; i += 1) {
    const a = (i / RING_SAMPLES) * Math.PI * 2
    p.set(r * Math.cos(a), 0, r * Math.sin(a)).project(camera)
    min = Math.min(min, Math.max(Math.abs(p.x), Math.abs(p.y)))
  }
  return min
}

/** Place `camera` for a preset at a distance; returns it for chaining. */
function placeCamera(camera: PerspectiveCamera, elevationDeg: number, distance: number) {
  const el = (elevationDeg * Math.PI) / 180
  camera.position.set(0, Math.sin(el) * distance, Math.cos(el) * distance)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  return camera
}

/**
 * How far the points reach in the view (NDC, 1 = edge), counting the strip the time bar
 * covers at the bottom as off the view: a point may sink no lower than -(1 - reserve).
 * A point behind the camera reaches infinitely far.
 */
export function pointsExtent(
  camera: PerspectiveCamera,
  points: readonly Vector3[],
  bottomReserveNdc = 0,
): number {
  let max = 0
  const p = new Vector3()
  for (const point of points) {
    p.copy(point).project(camera)
    if (p.z > 1) return Infinity
    const down = p.y < 0 ? -p.y + bottomReserveNdc : p.y
    max = Math.max(max, Math.abs(p.x), down)
  }
  return max
}

export interface FrameExtras {
  /** Scene positions that must also be in view: the deep-space craft in Heliosphere (#93). */
  points?: readonly Vector3[]
  /** The bottom strip the time bar covers, as a share of the view's NDC height (0–2). */
  bottomReserveNdc?: number
}

export interface FrameView {
  position: Vector3
  /** Where the camera looks (and OrbitControls orbits). */
  target: Vector3
}

/**
 * Heliosphere with craft (#93) looks from low over the ecliptic, so north and south of
 * the plane read as up and down: from 30° up, Voyager 1 (99 au north) projected right
 * beside the Sun and read as "near the Sun".
 */
export const HELIO_CRAFT_ELEVATION_DEG = 20
/** The outermost planet orbit the craft view must also hold: Neptune's aphelion, au. */
const NEPTUNE_AU = 30.4
const AZIMUTH_STEPS = 24

/** The largest NDC reach of points (time-bar strip counted as off the view). */
function bisectDistance(
  camera: PerspectiveCamera,
  target: Vector3,
  dir: Vector3,
  points: readonly Vector3[],
  reserve: number,
  start: number,
): number {
  let near = start * 0.02
  let far = start * 200
  for (let i = 0; i < 50; i += 1) {
    const mid = Math.sqrt(near * far)
    camera.position.copy(target).addScaledVector(dir, mid)
    camera.lookAt(target)
    camera.updateMatrixWorld()
    if (pointsExtent(camera, points, reserve) > FILL) near = mid
    else far = mid
  }
  return far
}

/**
 * Camera and target for a preset. Without craft points, or for any preset but
 * Heliosphere: framePreset's view, aimed at the Sun. Heliosphere with craft (#93): a low
 * view aimed at the centre of the framed objects (Neptune's orbit and the craft), at the
 * azimuth that sets the craft farthest from the Sun on screen relative to Neptune's
 * orbit, at the distance that fits them all above the time bar.
 */
export function frameView(
  preset: SunPreset,
  aspect: number,
  toScene: ToSceneRadius,
  extras: FrameExtras = {},
): FrameView {
  const points = extras.points ?? []
  if (preset !== 'heliosphere' || points.length === 0) {
    return { position: framePreset(preset, aspect, toScene, extras), target: new Vector3() }
  }
  const reserve = extras.bottomReserveNdc ?? 0
  const rN = toScene(NEPTUNE_AU)
  const ring = Array.from({ length: RING_SAMPLES }, (_, i) => {
    const a = (i / RING_SAMPLES) * Math.PI * 2
    return new Vector3(rN * Math.cos(a), 0, rN * Math.sin(a))
  })
  const framed = [...ring, ...points]
  const min = new Vector3(Infinity, Infinity, Infinity)
  const max = new Vector3(-Infinity, -Infinity, -Infinity)
  for (const p of framed) {
    min.min(p)
    max.max(p)
  }
  const target = min.clone().add(max).multiplyScalar(0.5)
  const size = max.clone().sub(min).length()
  const camera = new PerspectiveCamera(FOV, Math.max(0.1, aspect), 0.001, 1e7)
  camera.updateProjectionMatrix()
  const el = (HELIO_CRAFT_ELEVATION_DEG * Math.PI) / 180
  const sun = new Vector3()
  const onScreen = (p: Vector3) => {
    const v = p.clone().project(camera)
    return { x: v.x * aspect, y: v.y }
  }

  let best: FrameView | null = null
  let bestScore = -Infinity
  for (let k = 0; k < AZIMUTH_STEPS; k += 1) {
    const az = (k / AZIMUTH_STEPS) * Math.PI * 2
    const dir = new Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az))
    const distance = bisectDistance(camera, target, dir, framed, reserve, size)
    camera.position.copy(target).addScaledVector(dir, distance)
    camera.lookAt(target)
    camera.updateMatrixWorld()
    const s = onScreen(sun)
    const gap = (p: Vector3) => {
      const q = onScreen(p)
      return Math.hypot(q.x - s.x, q.y - s.y)
    }
    const neptune = Math.max(...ring.map(gap))
    const score = Math.min(...points.map(gap)) / Math.max(1e-9, neptune)
    if (score > bestScore) {
      bestScore = score
      best = { position: camera.position.clone(), target: target.clone() }
    }
  }
  return best ?? { position: framePreset(preset, aspect, toScene, extras), target: new Vector3() }
}

/**
 * Camera position (target is the Sun) that makes the preset's edge orbit fill the view,
 * and keeps any extra points (#93: Voyager 2 sits 90 au south of the ecliptic, outside
 * the 200 au ring's view) inside it and above the time bar.
 */
export function framePreset(
  preset: SunPreset,
  aspect: number,
  toScene: ToSceneRadius,
  extras: FrameExtras = {},
): Vector3 {
  const { edgeAu, elevationDeg } = PRESETS[preset]
  const r = toScene(edgeAu)
  const points = extras.points ?? []
  const reserve = extras.bottomReserveNdc ?? 0
  const camera = new PerspectiveCamera(FOV, Math.max(0.1, aspect), 0.001, 1e7)
  camera.updateProjectionMatrix()
  // Extent falls as distance grows: bisect for the distance where it equals FILL.
  let near = r * 0.05
  let far = r * 400
  for (let i = 0; i < 60; i += 1) {
    const mid = Math.sqrt(near * far)
    placeCamera(camera, elevationDeg, mid)
    const extent = Math.max(ringExtent(camera, r), pointsExtent(camera, points, reserve))
    if (extent > FILL) near = mid
    else far = mid
  }
  return placeCamera(camera, elevationDeg, far).position.clone()
}

/** The Earth–Moon/L1 view looks down on the ecliptic from this high, degrees (#92). */
export const EARTH_PRESET_ELEVATION_DEG = 25

/**
 * The Earth–Moon/L1 preset (#92): aimed at Earth, from beside the Sun–Earth line so L1
 * (sunward) and L2 sit to either side, at the distance where a ring of `extent` around
 * Earth fills FILL of the view above the time bar.
 */
export function earthPresetView(
  earth: Vector3,
  sun: Vector3,
  aspect: number,
  extent: number,
  bottomReserveNdc = 0,
): FrameView {
  const toSun = sun.clone().sub(earth)
  toSun.y = 0
  if (toSun.lengthSq() === 0) toSun.set(1, 0, 0)
  toSun.normalize()
  // Across the Sun line, in the ecliptic, then raised.
  const side = new Vector3(-toSun.z, 0, toSun.x)
  const el = (EARTH_PRESET_ELEVATION_DEG * Math.PI) / 180
  const dir = side.multiplyScalar(Math.cos(el)).add(new Vector3(0, Math.sin(el), 0))
  const ring = Array.from({ length: RING_SAMPLES }, (_, i) => {
    const a = (i / RING_SAMPLES) * Math.PI * 2
    return new Vector3(earth.x + extent * Math.cos(a), earth.y, earth.z + extent * Math.sin(a))
  })
  const camera = new PerspectiveCamera(FOV, Math.max(0.1, aspect), 0.0001, 1e7)
  camera.updateProjectionMatrix()
  const distance = bisectDistance(camera, earth, dir, ring, bottomReserveNdc, extent)
  return { position: earth.clone().addScaledVector(dir, distance), target: earth.clone() }
}

/**
 * A focused planet is seen at no more than this phase angle (Sun-planet-camera), so it
 * shows its lit face. Jupiter from Earth never passes about 12°; 35° leaves the
 * terminator in view for shape (#116).
 */
export const MAX_FOCUS_PHASE_DEG = 35

/** The focus camera's distance from the planet, and the Sun's drawn radius with corona. */
export interface SunClearance {
  readonly distance: number
  readonly sunClearance: number
}

/** Phase angles tried, from the limit toward full night, when the Sun is in the way. */
const PHASE_STEP_DEG = 2.5

/**
 * The camera direction (from the planet, unit) for focusing a planet (#116). Focusing
 * used to keep any old direction, and Jupiter drew from its night side at half its map's
 * brightness. Now:
 * - a direction already within MAX_FOCUS_PHASE_DEG of the Sun is kept, so the camera
 *   does not move needlessly;
 * - else the camera turns toward the Sun, keeping the side it came from, to the smallest
 *   phase angle (from the limit up) at which, given `clear`, the Sun's drawn corona does
 *   not sit behind or in front of the planet. Near Mercury the focus distance is longer
 *   than Mercury's distance from the Sun, so the full turn carried the camera past the
 *   Sun and its live image filled the stage (seen on a real GPU).
 * Without a clear phase it keeps the current direction.
 */
export function sunlitFocusDirection(
  target: Vector3,
  sun: Vector3,
  current: Vector3,
  clear?: SunClearance,
): Vector3 {
  const toSun = sun.clone().sub(target)
  if (toSun.lengthSq() === 0) return current.clone().normalize()
  toSun.normalize()
  const dir = current.clone().normalize()
  const limit = (MAX_FOCUS_PHASE_DEG * Math.PI) / 180
  const sunFree = (d: Vector3) => !clear || sunClearOfTarget(target, sun, d, clear)
  if (dir.angleTo(toSun) <= limit && sunFree(dir)) return dir
  const across = acrossSunLine(dir, toSun)
  for (let deg = MAX_FOCUS_PHASE_DEG; deg <= 180; deg += PHASE_STEP_DEG) {
    const phase = (deg * Math.PI) / 180
    const d = toSun.clone().multiplyScalar(Math.cos(phase)).addScaledVector(across, Math.sin(phase))
    if (sunFree(d)) return d
  }
  return dir
}

/**
 * Whether, from the camera at `target + d * distance`, the Sun's drawn corona stays off
 * the planet: the camera is outside it, and the angle between Sun and planet exceeds the
 * corona's angular radius.
 */
function sunClearOfTarget(target: Vector3, sun: Vector3, d: Vector3, clear: SunClearance): boolean {
  const camera = target.clone().addScaledVector(d, clear.distance)
  const toSun = sun.clone().sub(camera)
  const range = toSun.length()
  if (range <= clear.sunClearance) return false
  const coronaAngle = Math.asin(clear.sunClearance / range)
  return toSun.angleTo(target.clone().sub(camera)) > coronaAngle
}

/** The unit direction across the Sun line on the camera's side (+y when directly behind). */
function acrossSunLine(dir: Vector3, toSun: Vector3): Vector3 {
  const across = dir.clone().addScaledVector(toSun, -dir.dot(toSun))
  if (across.lengthSq() < 1e-12) {
    across.set(0, 1, 0).addScaledVector(toSun, -toSun.y)
    if (across.lengthSq() < 1e-12) across.set(1, 0, 0).addScaledVector(toSun, -toSun.x)
  }
  return across.normalize()
}
