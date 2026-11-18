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

  // #264: OrbitControls handles each finger's move on its own, zooming in between, so the
  // two half-pans of a still-midpoint pinch don't cancel and the target creeps one way.
  it('judges a two-finger pinch by its midpoint, not by the creeping target', () => {
    const t = new PanTracker()
    const target = new Vector3(5, 0, 0)
    t.begin(target)
    t.touches({ x: 200, y: 300 })
    for (let i = 0; i < 40; i += 1) {
      target.x += 0.6 * PX
      t.note(target)
      t.touches({ x: 200, y: 300 })
    }
    expect(t.released(PX)).toBe(false)
  })

  it('lets go when two fingers slide together', () => {
    const t = new PanTracker()
    const target = new Vector3(5, 0, 0)
    t.begin(target)
    t.touches({ x: 200, y: 300 })
    t.touches({ x: 200 + PAN_RELEASE_PX - 1, y: 300 })
    expect(t.released(PX)).toBe(false)
    t.touches({ x: 200 + PAN_RELEASE_PX + 1, y: 300 })
    expect(t.released(PX)).toBe(true)
  })

  it('goes back to the target when a finger lifts and one finger carries on', () => {
    const t = new PanTracker()
    const target = new Vector3(5, 0, 0)
    t.begin(target)
    t.touches({ x: 200, y: 300 })
    t.untouch()
    // The controls re-start the gesture with one finger left.
    t.begin(target)
    target.x += (PAN_RELEASE_PX + 1) * PX
    t.note(target)
    expect(t.released(PX)).toBe(true)
  })

  it('measures a re-landed pinch from where it re-landed', () => {
    const t = new PanTracker()
    const target = new Vector3(5, 0, 0)
    t.begin(target)
    t.touches({ x: 200, y: 300 })
    t.untouch()
    t.begin(target)
    t.touches({ x: 260, y: 300 })
    t.touches({ x: 262, y: 300 })
    expect(t.released(PX)).toBe(false)
  })

  it('goes back to the target after the gesture ends', () => {
    const t = new PanTracker()
    const target = new Vector3(5, 0, 0)
    t.begin(target)
    t.touches({ x: 200, y: 300 })
    t.end()
    t.begin(target)
    target.x += (PAN_RELEASE_PX + 1) * PX
    t.note(target)
    expect(t.released(PX)).toBe(true)
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
