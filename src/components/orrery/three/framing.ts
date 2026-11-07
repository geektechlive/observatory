/**
 * Camera framing for the orrery's presets (#91). Each preset names an orbit that should
 * nearly fill the stage: the camera distance is found numerically so that orbit, seen
 * from the preset's elevation with perspective, fits `FILL` of the view on both axes for
 * the stage's actual aspect. Pure, so the tests can check what each preset shows.
 */
import { PerspectiveCamera, Vector3 } from 'three'

export type FocusPreset = 'sun' | 'inner' | 'outer' | 'heliosphere'

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
export const PRESETS: Readonly<Record<FocusPreset, PresetDef>> = {
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
  preset: FocusPreset,
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
  preset: FocusPreset,
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
