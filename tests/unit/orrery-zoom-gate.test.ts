/**
 * Zooming past the orrery's closest approach enters the fly-in, and zooming out past the
 * fly-in's start returns (#261). A trackpad's momentum must not bounce in and out.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  GESTURE_GAP_MS,
  NOTCH_WINDOW_MS,
  PUSH_PX,
  swallowWheelUntilQuiet,
  wheelPx,
  ZoomGate,
} from '@/lib/orrery/zoomGate'

/** Feed a gesture of `n` events `px` each, 16 ms apart, from `t0`; returns the crossings. */
function gesture(
  gate: ZoomGate,
  t0: number,
  n: number,
  px: number,
  atLimit: boolean | ((i: number) => boolean),
): number {
  let crossed = 0
  for (let i = 0; i < n; i += 1) {
    const limit = typeof atLimit === 'function' ? atLimit(i) : atLimit
    if (gate.feed(px, limit, t0 + i * 16)) crossed += 1
  }
  return crossed
}

describe('ZoomGate', () => {
  it('crosses once when a fresh gesture pushes in past the limit far enough', () => {
    const gate = new ZoomGate('in')
    expect(gesture(gate, 0, 60, -20, true)).toBe(1)
  })

  it('never crosses on the gesture that reached the limit (its tail is momentum)', () => {
    const gate = new ZoomGate('in')
    // Twenty events zoom the camera in, then forty more arrive at the limit.
    expect(gesture(gate, 0, 60, -40, (i) => i >= 20)).toBe(0)
  })

  it('crosses on the next gesture after a pause', () => {
    const gate = new ZoomGate('in')
    const end = 60 * 16
    gesture(gate, 0, 60, -40, (i) => i >= 20)
    expect(gesture(gate, end + GESTURE_GAP_MS + 1, 60, -20, true)).toBe(1)
  })

  it('needs the full push, not a nudge', () => {
    const gate = new ZoomGate('in')
    const n = Math.floor(PUSH_PX / 20) - 1
    expect(gesture(gate, 0, n, -20, true)).toBe(0)
  })

  it('ignores the other direction', () => {
    const gate = new ZoomGate('in')
    expect(gesture(gate, 0, 60, 20, true)).toBe(0)
    const out = new ZoomGate('out')
    expect(gesture(out, 0, 60, 20, true)).toBe(1)
  })

  it('adds up slow mouse-wheel notches while the camera stays at the limit', () => {
    const gate = new ZoomGate('in')
    let crossed = 0
    for (let i = 0; i < 6; i += 1) if (gate.feed(-100, true, i * 500)) crossed += 1
    expect(crossed).toBe(1)
  })

  it('forgets a push after a long pause', () => {
    const gate = new ZoomGate('in')
    gate.feed(-300, true, 0)
    expect(gate.feed(-300, true, NOTCH_WINDOW_MS + 1)).toBe(false)
  })

  it('starts over if the camera leaves the limit mid-gesture', () => {
    const gate = new ZoomGate('in')
    expect(gesture(gate, 0, 60, -20, (i) => i !== 10)).toBe(0)
  })
})

describe('wheelPx', () => {
  it('scales lines, pages and a trackpad pinch as OrbitControls does', () => {
    expect(wheelPx({ deltaY: -3, deltaMode: 0, ctrlKey: false })).toBe(-3)
    expect(wheelPx({ deltaY: -3, deltaMode: 1, ctrlKey: false })).toBe(-48)
    expect(wheelPx({ deltaY: 1, deltaMode: 2, ctrlKey: false })).toBe(100)
    expect(wheelPx({ deltaY: -2, deltaMode: 0, ctrlKey: true })).toBe(-20)
  })
})

describe('swallowWheelUntilQuiet', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('stops wheel events until the gesture goes quiet, then lets them through', () => {
    vi.useFakeTimers()
    const seen = vi.fn()
    const target = document.createElement('div')
    document.body.append(target)
    target.addEventListener('wheel', seen)
    swallowWheelUntilQuiet(window)
    target.dispatchEvent(new WheelEvent('wheel', { deltaY: -10, bubbles: true, cancelable: true }))
    vi.advanceTimersByTime(GESTURE_GAP_MS - 50)
    target.dispatchEvent(new WheelEvent('wheel', { deltaY: -10, bubbles: true, cancelable: true }))
    expect(seen).not.toHaveBeenCalled()
    vi.advanceTimersByTime(GESTURE_GAP_MS + 1)
    target.dispatchEvent(new WheelEvent('wheel', { deltaY: -10, bubbles: true, cancelable: true }))
    expect(seen).toHaveBeenCalledTimes(1)
    target.remove()
  })
})
