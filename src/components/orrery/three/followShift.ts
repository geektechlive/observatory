import type { Vector3 } from 'three'

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
