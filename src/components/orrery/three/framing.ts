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

/** Camera position (target is the Sun) that makes the preset's edge orbit fill the view. */
export function framePreset(preset: FocusPreset, aspect: number, toScene: ToSceneRadius): Vector3 {
  const { edgeAu, elevationDeg } = PRESETS[preset]
  const r = toScene(edgeAu)
  const camera = new PerspectiveCamera(FOV, Math.max(0.1, aspect), 0.001, 1e7)
  camera.updateProjectionMatrix()
  // Extent falls as distance grows: bisect for the distance where it equals FILL.
  let near = r * 0.05
  let far = r * 400
  for (let i = 0; i < 60; i += 1) {
    const mid = Math.sqrt(near * far)
    const extent = ringExtent(placeCamera(camera, elevationDeg, mid), r)
    if (extent > FILL) near = mid
    else far = mid
  }
  return placeCamera(camera, elevationDeg, far).position.clone()
}
