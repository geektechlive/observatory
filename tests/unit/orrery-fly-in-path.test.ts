import { describe, expect, it } from 'vitest'

import {
  angleToArc,
  DECOR_FULL_KM,
  DECOR_GONE_KM,
  decorAt,
  EASE_MS,
  enterAt,
  FLIGHT_MS,
  LEAVE_EASE_MS,
  LEAVE_FLIGHT_MS,
  leaveAt,
  planFlyIn,
  radialClear,
  scaleRatio,
  turnClear,
  type V3,
} from '@/lib/orrery/flyInPath'

const len = (v: V3) => Math.hypot(v[0], v[1], v[2])
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

const UP: V3 = [0, 1, 0]
const SIDE: V3 = [1, 0, 0]

const base = {
  fromDir: UP,
  toDir: SIDE,
  d0: 4,
  ratio: 7,
  arrival: 1e-10,
  turnEndDistance: 0.07,
  obstacles: [],
  d1Min: 0.1,
  d1Max: 1e3,
}

describe('planFlyIn', () => {
  it('starts the flight at the visitor distance times the scale ratio, within limits', () => {
    expect(planFlyIn(base).d1).toBeCloseTo(28)
    expect(planFlyIn({ ...base, ratio: 1e-6 }).d1).toBe(0.1)
    expect(planFlyIn({ ...base, ratio: 1e6 }).d1).toBe(1e3)
  })

  it('turns during the flight when the path is clear', () => {
    expect(planFlyIn(base).turnFirst).toBe(false)
  })

  it('turns during the ease instead when the turning path would cross a body', () => {
    // A body sitting on the arc between UP and SIDE at a distance the turn passes through.
    const d = 1
    const mid: V3 = [Math.SQRT1_2 * d, Math.SQRT1_2 * d, 0]
    const plan = planFlyIn({ ...base, obstacles: [{ center: mid, radius: 0.3 }] })
    expect(plan.turnFirst).toBe(true)
    expect(dot(plan.toDir, SIDE)).toBeCloseTo(1)
  })

  it('keeps the turn in the flight when a body at those distances is off the turn', () => {
    // Parker's case: the Sun is at a distance the turn passes, but on the far side of it.
    const plan = planFlyIn({ ...base, obstacles: [{ center: [-1, -0.2, 0], radius: 0.05 }] })
    expect(plan.turnFirst).toBe(false)
    expect(dot(plan.toDir, SIDE)).toBeCloseTo(1)
  })

  it('flies straight in on the visitor side when neither turn is clear', () => {
    // A body on the turn's path in the flight, and one on it in the ease (at 10, 42 degrees on).
    const a = (42 * Math.PI) / 180
    const plan = planFlyIn({
      ...base,
      obstacles: [
        { center: [Math.SQRT1_2, Math.SQRT1_2, 0], radius: 0.3 },
        { center: [Math.sin(a) * 10, Math.cos(a) * 10, 0], radius: 1 },
      ],
    })
    expect(plan.turnFirst).toBe(true)
    expect(dot(plan.toDir, UP)).toBeCloseTo(1)
  })
})

describe('angleToArc, turnClear and radialClear', () => {
  it('measures the angle to the nearest point of a part of a turn', () => {
    // UP to SIDE in the xy plane; a direction out of the plane, over the middle.
    const p: V3 = [Math.SQRT1_2, Math.SQRT1_2, 1]
    expect(angleToArc(UP, SIDE, 0, 1, p)).toBeCloseTo(Math.PI / 4)
    // Past the end of the part: the angle to its end.
    expect(angleToArc(UP, SIDE, 0, 0.25, SIDE)).toBeCloseTo((3 * Math.PI) / 8)
  })

  it('meets a body only where the turn passes it at its distance', () => {
    const share = (d: number) => Math.min(1, Math.max(0, Math.log(10 / d) / Math.log(10 / 0.1)))
    const onPath = [{ center: [Math.SQRT1_2, Math.SQRT1_2, 0] as V3, radius: 0.1 }]
    const offPath = [{ center: [0, 0, 1] as V3, radius: 0.1 }]
    expect(turnClear(UP, SIDE, 0.1, 10, share, onPath)).toBe(false)
    expect(turnClear(UP, SIDE, 0.1, 10, share, offPath)).toBe(true)
  })

  it('catches a body between two far-apart points of a straight line, never sampling', () => {
    // From 100 out to 0.001 along +x: a small body at 50 on the line is crossed.
    const o = [{ center: [50, 0, 0] as V3, radius: 0.01 }]
    expect(radialClear([1, 0, 0], 100, 0.001, o)).toBe(false)
    expect(radialClear([0, 1, 0], 100, 0.001, o)).toBe(true)
  })
})

describe('enterAt', () => {
  const plan = planFlyIn(base)

  it('begins where the visitor is, at their scale', () => {
    const f = enterAt(plan, 0)
    expect(f.trueness).toBe(0)
    expect(f.distance).toBeCloseTo(4)
    expect(dot(f.direction, UP)).toBeCloseTo(1)
    expect(f.phase).toBe('ease')
  })

  it('reaches true scale at the end of the ease, at the flight start', () => {
    const f = enterAt(plan, EASE_MS)
    expect(f.trueness).toBe(1)
    expect(f.distance).toBeCloseTo(plan.d1)
  })

  it('eases trueness smoothly and only forward', () => {
    let last = -1
    for (let t = 0; t <= EASE_MS; t += EASE_MS / 20) {
      const { trueness } = enterAt(plan, t)
      expect(trueness).toBeGreaterThanOrEqual(last)
      last = trueness
    }
  })

  it('arrives at the arrival distance on the framing side', () => {
    const f = enterAt(plan, EASE_MS + FLIGHT_MS)
    expect(f.phase).toBe('arrived')
    expect(f.distance).toBeCloseTo(1e-10, 15)
    expect(dot(f.direction, SIDE)).toBeCloseTo(1)
  })

  it('has finished the turn by the turn-end distance', () => {
    for (let t = EASE_MS; t <= EASE_MS + FLIGHT_MS; t += FLIGHT_MS / 200) {
      const f = enterAt(plan, t)
      if (f.distance <= base.turnEndDistance) expect(dot(f.direction, SIDE)).toBeCloseTo(1)
    }
  })

  it('keeps the direction a unit vector and the distance falling through the flight', () => {
    let last = Infinity
    for (let t = EASE_MS; t <= EASE_MS + FLIGHT_MS; t += FLIGHT_MS / 50) {
      const f = enterAt(plan, t)
      expect(len(f.direction)).toBeCloseTo(1)
      expect(f.distance).toBeLessThanOrEqual(last)
      last = f.distance
    }
  })

  it('turns in the ease when told to, and flies straight after', () => {
    const early = { ...plan, turnFirst: true }
    expect(dot(enterAt(early, EASE_MS).direction, SIDE)).toBeCloseTo(1)
    expect(dot(enterAt(early, EASE_MS + FLIGHT_MS / 2).direction, SIDE)).toBeCloseTo(1)
  })

  it('jumps to arrival with reduced motion', () => {
    const f = enterAt(plan, 0, true)
    expect(f.phase).toBe('arrived')
    expect(f.trueness).toBe(1)
    expect(f.distance).toBeCloseTo(1e-10, 15)
  })
})

describe('leaveAt', () => {
  const leave = { fromDir: SIDE, toDir: UP, from: 1e-9, d1: 28, d0: 4 }

  it('flies back out to the flight start at true scale first', () => {
    const f = leaveAt(leave, LEAVE_FLIGHT_MS)
    expect(f.trueness).toBe(1)
    expect(f.distance).toBeCloseTo(28)
  })

  it('then eases back to the visitor scale, distance and direction', () => {
    const f = leaveAt(leave, LEAVE_FLIGHT_MS + LEAVE_EASE_MS)
    expect(f.phase).toBe('done')
    expect(f.trueness).toBe(0)
    expect(f.distance).toBeCloseTo(4)
    expect(dot(f.direction, UP)).toBeCloseTo(1)
  })

  it('cuts straight back with reduced motion', () => {
    const f = leaveAt(leave, 0, true)
    expect(f.phase).toBe('done')
    expect(f.trueness).toBe(0)
  })
})

describe('decorAt', () => {
  it('is whole far out, gone close in, and falls in between', () => {
    expect(decorAt(DECOR_FULL_KM * 10)).toBe(1)
    expect(decorAt(DECOR_GONE_KM / 10)).toBe(0)
    const mid = decorAt(Math.sqrt(DECOR_FULL_KM * DECOR_GONE_KM))
    expect(mid).toBeCloseTo(0.5)
    expect(decorAt(DECOR_FULL_KM * 0.9)).toBeGreaterThan(mid)
  })
})

describe('scaleRatio', () => {
  it('keeps the nearest body (by true distance) at its apparent separation', () => {
    const r = scaleRatio({ true: [1, 0, 0], drawn: [0.14, 0, 0] }, [
      { true: [0, 0, 0], drawn: [0, 0, 0] },
      { true: [7, 0, 0], drawn: [1, 0, 0] },
    ])
    expect(r).toBeCloseTo(1 / 0.14)
  })

  it('is 1 when the drawn separation is zero', () => {
    expect(
      scaleRatio({ true: [1, 0, 0], drawn: [0, 0, 0] }, [{ true: [0, 0, 0], drawn: [0, 0, 0] }]),
    ).toBe(1)
  })
})
