/**
 * Following the focus (#186): a focused object that is no longer drawn (a hidden craft or
 * L1, a close approach past its samples) leaves the camera where it was; it is not pulled
 * to the origin, which is the Sun.
 */
import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'

import { followShift } from '@/components/orrery/three/followShift'

describe('followShift', () => {
  const target = new Vector3(1, 2, 3)

  it('holds the camera when the focused object has no drawn position', () => {
    expect(followShift(null, target)).toBeNull()
  })

  it('holds the camera when the object has not moved', () => {
    expect(followShift(new Vector3(1, 2, 3), target)).toBeNull()
  })

  it('shifts the camera by how far the object moved', () => {
    const shift = followShift(new Vector3(4, 2, 0), target)
    expect(shift?.toArray()).toEqual([3, 0, -3])
  })

  it('does not change the target it is given', () => {
    followShift(new Vector3(9, 9, 9), target)
    expect(target.toArray()).toEqual([1, 2, 3])
  })
})
