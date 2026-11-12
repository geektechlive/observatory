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
 * `topReserveNdc` does the same for a strip covered at the top (a phone's guide bar).
 * A point behind the camera reaches infinitely far.
 */
export function pointsExtent(
  camera: PerspectiveCamera,
  points: readonly Vector3[],
  bottomReserveNdc = 0,
  topReserveNdc = 0,
): number {
  let max = 0
  const p = new Vector3()
  for (const point of points) {
    p.copy(point).project(camera)
    if (p.z > 1) return Infinity
    const down = p.y < 0 ? -p.y + bottomReserveNdc : p.y + topReserveNdc
    max = Math.max(max, Math.abs(p.x), down)
  }
  return max
}

export interface FrameExtras {
  /** Scene positions that must also be in view: the deep-space craft in Heliosphere (#93). */
  points?: readonly Vector3[]
  /** The bottom strip the time bar covers, as a share of the view's NDC height (0–2). */
  bottomReserveNdc?: number
  /** The top strip something covers (a phone's guide bar), as a share of NDC height. */
  topReserveNdc?: number
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
  topReserve = 0,
): number {
  let near = start * 0.02
  let far = start * 200
  for (let i = 0; i < 50; i += 1) {
    const mid = Math.sqrt(near * far)
    camera.position.copy(target).addScaledVector(dir, mid)
    camera.lookAt(target)
    camera.updateMatrixWorld()
    if (pointsExtent(camera, points, reserve, topReserve) > FILL) near = mid
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
  const topReserve = extras.topReserveNdc ?? 0
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
    const distance = bisectDistance(camera, target, dir, framed, reserve, size, topReserve)
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
  const topReserve = extras.topReserveNdc ?? 0
  const camera = new PerspectiveCamera(FOV, Math.max(0.1, aspect), 0.001, 1e7)
  camera.updateProjectionMatrix()
  // Extent falls as distance grows: bisect for the distance where it equals FILL.
  let near = r * 0.05
  let far = r * 400
  for (let i = 0; i < 60; i += 1) {
    const mid = Math.sqrt(near * far)
    placeCamera(camera, elevationDeg, mid)
    const extent = Math.max(
      ringExtent(camera, r),
      pointsExtent(camera, points, reserve, topReserve),
    )
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
 * How far from the target the free part of the stage reaches, in NDC (1 = the canvas
 * edge): the inspector drawer narrows `x`, the time bar or the phone's sheet `down`.
 */
export interface FocusRoom {
  x: number
  up: number
  down: number
}

/** The largest share of the free room any point takes; Infinity behind the camera. */
function roomExtent(
  camera: PerspectiveCamera,
  points: readonly Vector3[],
  room: FocusRoom,
): number {
  let max = 0
  const p = new Vector3()
  for (const point of points) {
    p.copy(point).project(camera)
    if (p.z > 1) return Infinity
    max = Math.max(max, Math.abs(p.x) / room.x, p.y >= 0 ? p.y / room.up : -p.y / room.down)
  }
  return max
}

/** A looked-up object's focus view looks from this high over the ecliptic, degrees. */
export const LOOKUP_FOCUS_ELEVATION_DEG = 25

/**
 * The focus view for an object looked up at JPL (#145): aimed at the object, holding the
 * Sun (and Earth, when the caller passes it) in the free part of the stage, from the
 * azimuth (of 24) that sets them farthest apart on screen. A far visitor like 3I/ATLAS
 * at 13 au otherwise filled the view alone, with nothing to say where it is.
 */
export function lookupFocusView(
  target: Vector3,
  others: readonly Vector3[],
  aspect: number,
  room: FocusRoom,
): FrameView {
  const points = [target, ...others]
  const camera = new PerspectiveCamera(FOV, Math.max(0.1, aspect), 0.0001, 1e7)
  camera.updateProjectionMatrix()
  const size = Math.max(1e-6, ...others.map((o) => o.distanceTo(target)))
  const el = (LOOKUP_FOCUS_ELEVATION_DEG * Math.PI) / 180
  const v = new Vector3()
  let best: FrameView | null = null
  let bestGap = -Infinity
  for (let k = 0; k < AZIMUTH_STEPS; k += 1) {
    const az = (k / AZIMUTH_STEPS) * Math.PI * 2
    const dir = new Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az))
    // Bisect for the distance where the points fill FILL of the free room.
    let near = size * 0.02
    let far = size * 200
    for (let i = 0; i < 50; i += 1) {
      const mid = Math.sqrt(near * far)
      camera.position.copy(target).addScaledVector(dir, mid)
      camera.lookAt(target)
      camera.updateMatrixWorld()
      if (roomExtent(camera, points, room) > FILL) near = mid
      else far = mid
    }
    camera.position.copy(target).addScaledVector(dir, far)
    camera.lookAt(target)
    camera.updateMatrixWorld()
    const ndc = points.map((p) => {
      v.copy(p).project(camera)
      return { x: v.x * aspect, y: v.y }
    })
    let gap = Infinity
    for (let i = 0; i < ndc.length; i += 1) {
      for (let j = i + 1; j < ndc.length; j += 1) {
        const a = ndc[i]
        const b = ndc[j]
        if (a && b) gap = Math.min(gap, Math.hypot(a.x - b.x, a.y - b.y))
      }
    }
    if (gap > bestGap) {
      bestGap = gap
      best = { position: camera.position.clone(), target: target.clone() }
    }
  }
  return (
    best ?? { position: target.clone().add(new Vector3(0, size, size)), target: target.clone() }
  )
}

export interface NearFocusInput {
  /** The focus (a close approach, L1, an L1/L2 craft), where it is drawn in the open Earth frame. */
  target: Vector3
  earth: Vector3
  /** Earth's drawn radius, scene units: its whole disc is kept in the free room. */
  earthRadius: number
  /** The camera's direction from the target before the focus (any length). */
  current: Vector3
  aspect: number
  room: FocusRoom
  /** The camera stands at least this far from the target (the old fixed distance). */
  minDistance: number
  /** And no farther than this from Earth, or the Earth frame starts to close. */
  maxEarthDistance: number
  /** A refit of a view already flown to (the inspector's inset changed): turn less readily. */
  refit?: boolean
}

/** One camera direction for a near-Earth focus, fitted. */
export interface NearFocusCandidate {
  dir: Vector3
  distance: number
  /** False when even NEAR_FIT_MAX_FACTOR times minDistance cannot hold both. */
  fits: boolean
  earthDistance: number
  /** Focus-to-Earth distance on screen, NDC height units (x scaled by the aspect). */
  gap: number
  /** Earth's drawn radius on screen, in the same units. */
  earthNdc: number
}

export interface NearFocusView extends FrameView {
  /** Both fit the free room (false: the farthest fit tried, clamped). */
  fits: boolean
  /** The camera left its own side for one of the 24 azimuths. */
  turned: boolean
}

/** The fit's distance is searched up to this many times minDistance, then clamped. */
export const NEAR_FIT_MAX_FACTOR = 1000
/** A first focus keeps its side while the focus is this many Earth radii from Earth on screen. */
const NEAR_GAP_FIRST = 2
/** A refit keeps it down to this many (#133 review: no flip on a marginal refit). */
const NEAR_GAP_REFIT = 1
/** Below that, it turns only to a side with at least this much more gap. */
const NEAR_TURN_GAIN = 1.25

/** The largest share of the free room a disc takes (NDC); Infinity behind the camera. */
function discRoomExtent(
  camera: PerspectiveCamera,
  p: Vector3,
  radius: number,
  aspect: number,
  room: FocusRoom,
): number {
  const v = p.clone().project(camera)
  if (v.z > 1) return Infinity
  const ry = radius / (p.distanceTo(camera.position) * Math.tan((FOV * Math.PI) / 360))
  const rx = ry / aspect
  // The disc's right or left, top and bottom edges against the room on each side.
  return Math.max((Math.abs(v.x) + rx) / room.x, (v.y + ry) / room.up, (ry - v.y) / room.down)
}

/** The 24 directions a near-Earth focus may turn to: 25° up, 15° apart in azimuth. */
export function nearFocusAzimuths(): Vector3[] {
  const el = (LOOKUP_FOCUS_ELEVATION_DEG * Math.PI) / 180
  return Array.from({ length: AZIMUTH_STEPS }, (_, k) => {
    const az = (k / AZIMUTH_STEPS) * Math.PI * 2
    return new Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az))
  })
}

/** Fit one direction (any length; zero means the default): its distance, gap and limits. */
export function nearFocusCandidate(input: NearFocusInput, direction: Vector3): NearFocusCandidate {
  const { target, earth, earthRadius, aspect, room, minDistance } = input
  const dir = direction.clone()
  if (dir.lengthSq() === 0) dir.set(0, 0.5, 1)
  dir.normalize()
  const camera = new PerspectiveCamera(FOV, Math.max(0.1, aspect), 0.0001, 1e7)
  camera.updateProjectionMatrix()
  const place = (distance: number) => {
    camera.position.copy(target).addScaledVector(dir, distance)
    camera.lookAt(target)
    camera.updateMatrixWorld()
  }
  const extent = () =>
    Math.max(
      discRoomExtent(camera, target, 0, aspect, room),
      discRoomExtent(camera, earth, earthRadius, aspect, room),
    )
  // The nearest distance (at least minDistance) that holds both, searched up to a bound:
  // beyond it the candidate is clamped there and marked as not fitting.
  let distance = minDistance
  let fits = true
  place(minDistance)
  if (extent() > FILL) {
    const bound = minDistance * NEAR_FIT_MAX_FACTOR
    place(bound)
    if (extent() > FILL) {
      distance = bound
      fits = false
    } else {
      let near = minDistance
      let far = bound
      for (let i = 0; i < 50; i += 1) {
        const mid = Math.sqrt(near * far)
        place(mid)
        if (extent() > FILL) near = mid
        else far = mid
      }
      distance = far
    }
  }
  place(distance)
  const a = target.clone().project(camera)
  const b = earth.clone().project(camera)
  const earthDistance = camera.position.distanceTo(earth)
  return {
    dir,
    distance,
    fits,
    earthDistance,
    gap: Math.hypot((b.x - a.x) * aspect, b.y - a.y),
    earthNdc: earthRadius / (earthDistance * Math.tan((FOV * Math.PI) / 360)),
  }
}

/**
 * The view for a near-Earth focus (#133): a close approach, L1 or an L1/L2 craft, aimed at
 * it, holding it and Earth's disc in the free part of the stage, no nearer than
 * `minDistance`. The camera keeps its side while that fits within `maxEarthDistance` of
 * Earth (so the Earth frame stays open) and Earth's disc stays clear of the focus on
 * screen; else it takes the direction (of 24, from 25° up) that sets the two farthest
 * apart. A refit (the inspector opened) keeps the side down to a smaller gap, and below
 * that turns only for 25% more gap, so the camera does not swing on its own. Before, it
 * stood a fixed 40 frame units off: Earth, 15.6 units from a 0.04 au pass, fell under the
 * inspector or off the stage depending on where the camera had come from.
 */
export function nearFocusView(input: NearFocusInput): NearFocusView {
  const open = (c: NearFocusCandidate) => c.fits && c.earthDistance <= input.maxEarthDistance
  const view = (c: NearFocusCandidate, turned: boolean): NearFocusView => ({
    position: input.target.clone().addScaledVector(c.dir, c.distance),
    target: input.target.clone(),
    fits: c.fits,
    turned,
  })
  const kept = nearFocusCandidate(input, input.current)
  const clear = (input.refit ? NEAR_GAP_REFIT : NEAR_GAP_FIRST) * kept.earthNdc
  if (open(kept) && kept.gap > clear) return view(kept, false)

  // Best alternative: open with the widest gap; else fitting nearest Earth; else nearest.
  const rank = (c: NearFocusCandidate) => (open(c) ? 2 : c.fits ? 1 : 0)
  let best: NearFocusCandidate | null = null
  for (const dir of nearFocusAzimuths()) {
    const c = nearFocusCandidate(input, dir)
    if (!best || rank(c) > rank(best)) best = c
    else if (rank(c) === rank(best)) {
      if (rank(c) === 2 ? c.gap > best.gap : c.earthDistance < best.earthDistance) best = c
    }
  }
  if (!best) return view(kept, false)
  if (open(kept)) {
    // Only the gap is short: turn only to a side clearly better.
    return open(best) && best.gap >= NEAR_TURN_GAIN * kept.gap
      ? view(best, true)
      : view(kept, false)
  }
  return rank(best) > rank(kept) ||
    (rank(best) === rank(kept) && best.earthDistance < kept.earthDistance)
    ? view(best, true)
    : view(kept, false)
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
