/**
 * The fly-in's second pass (#268): the craft's model, drawn after the orrery in a small scene
 * of its own, in units of the model's own radius, with a camera matched to the orrery's.
 *
 * A craft a few metres across, a few hundred metres from the camera, is 1e-11 orrery units
 * across. three.js composes matrices in 64-bit JavaScript numbers, so placing it is exact, but
 * one depth buffer cannot hold its parts apart while also holding the Sun and planets. So the
 * orrery draws everything else first (its near plane set from the nearest body's surface), the
 * depth buffer is cleared, and this scene draws the model with a near and far plane of its
 * own. No body can stand between the camera and a craft a few hundred metres away; before
 * the camera is that close, the model is under a pixel. Lit by the Sun's direction and a faint
 * fill, as the old fly-in was (FILL_INTENSITY, the owner's choice, 2026-11-17).
 */
import {
  AmbientLight,
  Color,
  DirectionalLight,
  type Object3D,
  PerspectiveCamera,
  Scene,
  type Vector3,
} from 'three'

/** The orrery's sunlight (OrreryRenderer), and the old fly-in's faint fill. */
const SUNLIGHT_INTENSITY = Math.PI * 1.1
export const FILL_INTENSITY = Math.PI * 0.03
/** The near plane sits this share of the way from the camera to the model's surface. */
const NEAR_SHARE = 0.5
/** The near plane is never closer than this share of the camera's distance. */
const NEAR_FLOOR = 1e-3

export interface NearFrame {
  /** The orrery's camera, as it is drawing this frame. */
  readonly main: PerspectiveCamera
  /** The model's centre in the orrery's scene. */
  readonly centre: Vector3
  /** Orrery units in one unit of this scene: the model's drawn robust radius. */
  readonly unit: number
  /** The model's farthest vertex, in its robust radii. */
  readonly fullShare: number
  /** Unit direction from the model to the Sun, orrery axes. */
  readonly toSun: Vector3
}

export class NearPass {
  readonly scene = new Scene()
  readonly camera = new PerspectiveCamera()
  private readonly sun = new DirectionalLight(new Color(1, 1, 1), SUNLIGHT_INTENSITY)
  private readonly fill = new AmbientLight(new Color(1, 1, 1), FILL_INTENSITY)

  constructor() {
    this.scene.add(this.sun, this.sun.target, this.fill)
  }

  /** Put the model (centred, robust radius 1) in this scene, or take it out with null. */
  hold(model: Object3D | null): void {
    for (const child of [...this.scene.children]) {
      if (child !== this.sun && child !== this.sun.target && child !== this.fill) {
        this.scene.remove(child)
      }
    }
    if (model) this.scene.add(model)
  }

  /** Match the orrery's camera, the model at this scene's origin, for this frame. */
  sync(f: NearFrame): void {
    const c = this.camera
    c.copy(f.main, false)
    // The camera relative to the model, in model radii: a difference of two orrery positions,
    // taken in 64-bit numbers before anything reaches the GPU.
    c.position.copy(f.main.position).sub(f.centre).divideScalar(f.unit)
    c.quaternion.copy(f.main.quaternion)
    const d = c.position.length()
    const reach = Math.max(f.fullShare, 1)
    c.near = Math.max((d - reach) * NEAR_SHARE, d * NEAR_FLOOR)
    c.far = d + reach * 2
    c.updateProjectionMatrix()
    c.updateMatrixWorld(true)
    this.sun.position.copy(f.toSun)
    this.sun.target.position.set(0, 0, 0)
    this.sun.updateMatrixWorld(true)
    this.sun.target.updateMatrixWorld(true)
  }

  dispose(): void {
    this.hold(null)
    this.sun.dispose()
    this.fill.dispose()
  }
}

/**
 * The orrery pass's near plane in the fly-in: half the way to the nearest body's surface, in
 * [min, max]. Juno at perijove has Jupiter's cloud tops about 4,000 km away.
 */
export function bodyNearPlane(
  surfaceDistances: readonly number[],
  min: number,
  max: number,
): number {
  let nearest = Infinity
  for (const d of surfaceDistances) if (d < nearest) nearest = d
  if (!Number.isFinite(nearest)) return max
  return Math.min(max, Math.max(min, nearest * NEAR_SHARE))
}
