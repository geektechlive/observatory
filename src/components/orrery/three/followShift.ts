import { Vector3 } from 'three'

/**
 * How far the camera moves to keep following a focused object (#186): the vector from the
 * camera's current target to where the object is drawn now. Null holds the camera: the
 * object has no drawn position (a hidden craft or L1, a close approach past its samples),
 * or has not moved. Never the origin, which is the Sun.
 */
export function followShift(drawn: Vector3 | null, target: Vector3): Vector3 | null {
  if (!drawn) return null
  const shift = drawn.clone().sub(target)
  return shift.lengthSq() === 0 ? null : shift
}

/**
 * A gesture's net slide past this many px lets go of the followed focus (#259). Net, not
 * total: a pinch's midpoint wobbles back and forth (OrbitControls' two-finger gesture is
 * dolly plus pan), and a rounding error in the controls' target clamp is far below a px.
 */
export const PAN_RELEASE_PX = 10

/**
 * The slide in one gesture (#259), fed from the controls' `change` events, which fire inside
 * every update() including the one the pointer handler runs itself when damping is off.
 * `begin` at the gesture's start; `note` after each change with where the renderer last put
 * the target (the follow writes it too, so its own moves never count); `released` says
 * whether the net slide has passed PAN_RELEASE_PX at `unitsPerPx`.
 */
export class PanTracker {
  private readonly net = new Vector3()
  private readonly last = new Vector3()
  private active = false

  begin(target: Vector3): void {
    this.net.set(0, 0, 0)
    this.last.copy(target)
    this.active = true
  }

  end(): void {
    this.active = false
  }

  /** The renderer moved the target itself (the follow): not the visitor's slide. */
  moved(target: Vector3): void {
    this.last.copy(target)
  }

  /** The controls changed the target: add the step to the gesture's net slide. */
  note(target: Vector3): void {
    if (!this.active) return
    this.net.add(target.clone().sub(this.last))
    this.last.copy(target)
  }

  released(unitsPerPx: number): boolean {
    return this.active && this.net.length() > PAN_RELEASE_PX * unitsPerPx
  }
}
