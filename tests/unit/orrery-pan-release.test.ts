/**
 * #259: a slide lets go of the followed focus. The tracker sums one gesture's net slide from
 * the controls' change events; the follow's own moves, a pinch's wobble and rounding don't
 * count, and nothing counts outside a gesture (damping left over from an earlier drag).
 */
import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'

import { PAN_RELEASE_PX, PanTracker } from '@/components/orrery/three/followShift'

const PX = 0.001

describe('PanTracker (#259)', () => {
  it('lets go once the net slide passes the threshold', () => {
    const t = new PanTracker()
    const target = new Vector3(5, 0, 0)
    t.begin(target)
    target.x += (PAN_RELEASE_PX - 1) * PX
    t.note(target)
    expect(t.released(PX)).toBe(false)
    target.x += 2 * PX
    t.note(target)
    expect(t.released(PX)).toBe(true)
  })

  it('does not count the follow moving the target', () => {
    const t = new PanTracker()
    const target = new Vector3(5, 0, 0)
    t.begin(target)
    for (let i = 0; i < 50; i += 1) {
      // The body moves on with the clock and the follow puts the target on it.
      target.x += 5 * PX
      t.moved(target)
      // A tiny slide each frame, which the follow then undoes.
      target.y += 0.5 * PX
      t.note(target)
      target.y -= 0.5 * PX
      t.moved(target)
    }
    // 50 half-px steps add up: the slide is real even though the follow undid each one.
    expect(t.released(PX)).toBe(true)
  })

  it('does not count a pinch that wobbles back and forth', () => {
    const t = new PanTracker()
    const target = new Vector3(5, 0, 0)
    t.begin(target)
    for (let i = 0; i < 40; i += 1) {
      target.x += (i % 2 === 0 ? 3 : -3) * PX
      t.note(target)
    }
    expect(t.released(PX)).toBe(false)
  })

  it('counts nothing outside a gesture, and a new gesture starts from zero', () => {
    const t = new PanTracker()
    const target = new Vector3(5, 0, 0)
    t.begin(target)
    target.x += 6 * PX
    t.note(target)
    t.end()
    // Damping keeps sliding after the pointer is up.
    target.x += 100 * PX
    t.note(target)
    expect(t.released(PX)).toBe(false)
    t.begin(target)
    target.x += 6 * PX
    t.note(target)
    expect(t.released(PX)).toBe(false)
  })
})
