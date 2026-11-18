/**
 * A looping craft's whole-mission span between its 3-day samples (#262). Parker Solar Probe
 * sweeps up to ~137° of its orbit a day near perihelion, so a straight chord (or Catmull-Rom)
 * between samples cut through the Sun: production's path came within 0.4 solar radii of the
 * Sun's centre. Between samples the craft follows its two-body arc, so the oracle here is
 * a Parker-like conic sampled the way the refresh job samples it.
 */
import { describe, expect, it } from 'vitest'

import { type ConicElements, conicPosition } from '@/lib/orrery/conic'
import { stateAt, trajectoryPoints } from '@/lib/orrery/ephemeris'
import {
  ARC_MIN_SWEEP_RAD,
  arcSweep,
  keplerArcState,
  lambertVelocity,
  propagateKepler,
} from '@/lib/orrery/keplerArc'
import type { OrreryTrack } from '@/schemas/orreryBodies'

const SUN_RADIUS_AU = 696_000 / 149_597_870.7
/** Parker's final orbit: 9.86 solar radii by 0.73 au. */
const Q = 0.0459
const APHELION = 0.73
const PARKER: ConicElements = {
  e: (APHELION - Q) / (APHELION + Q),
  q: Q,
  tp: 2_461_376.5,
  om: 76.7,
  w: 26.3,
  i: 3.4,
}
const STEP = 3

/** Coarse samples every 3 days with a perihelion half-way between two of them. */
function coarseTrack(el: ConicElements, start: number, days: number): OrreryTrack {
  const samples: number[] = []
  for (let jd = start; jd <= start + days; jd += STEP) {
    const p = conicPosition(el, jd)
    samples.push(p.x, p.y, p.z)
  }
  return {
    fine: null,
    coarse: { start, step: STEP, samples },
  } as unknown as OrreryTrack
}

const START = PARKER.tp - 60 - STEP / 2
const track = coarseTrack(PARKER, START, 180)

const r = (p: { x: number; y: number; z: number }) => Math.hypot(p.x, p.y, p.z)

describe('the Parker-like oracle', () => {
  it('has a 3-day step that sweeps more than 180° around the Sun', () => {
    const a = conicPosition(PARKER, PARKER.tp - STEP / 2)
    const b = conicPosition(PARKER, PARKER.tp + STEP / 2)
    const cos = (a.x * b.x + a.y * b.y + a.z * b.z) / (a.r * b.r)
    const crossZ = a.x * b.y - a.y * b.x
    // Prograde, and the short way round would be retrograde: the sweep is past 180°.
    expect(crossZ).toBeLessThan(0)
    expect(cos).toBeGreaterThan(-1)
  })
})

describe('Kepler arcs between coarse samples (#262)', () => {
  it('solves the step and lands on the next sample', () => {
    const a = conicPosition(PARKER, PARKER.tp - STEP / 2)
    const b = conicPosition(PARKER, PARKER.tp + STEP / 2)
    const v = lambertVelocity(a, b, STEP)
    expect(v).not.toBeNull()
    const end = propagateKepler(a, v ?? a, STEP)
    expect(end).not.toBeNull()
    expect(
      Math.hypot(
        (end?.position.x ?? 0) - b.x,
        (end?.position.y ?? 0) - b.y,
        (end?.position.z ?? 0) - b.z,
      ),
    ).toBeLessThan(1e-9)
  })

  it('puts the craft at perihelion where the conic does', () => {
    const state = stateAt(track, PARKER.tp)
    const truth = conicPosition(PARKER, PARKER.tp)
    expect(state).not.toBeNull()
    const p = state?.position ?? { x: 0, y: 0, z: 0 }
    expect(Math.hypot(p.x - truth.x, p.y - truth.y, p.z - truth.z)).toBeLessThan(1e-7)
    expect(r(p)).toBeCloseTo(Q, 6)
  })

  it('follows the conic all the way round, never inside perihelion', () => {
    let arcSteps = 0
    for (let jd = START; jd < START + 180; jd += 0.05) {
      const p = stateAt(track, jd)?.position
      if (!p) continue
      const truth = conicPosition(PARKER, jd)
      const i = Math.floor((jd - START) / STEP)
      const turns =
        arcSweep(
          conicPosition(PARKER, START + i * STEP),
          conicPosition(PARKER, START + (i + 1) * STEP),
        ) >= ARC_MIN_SWEEP_RAD
      if (turns) arcSteps += 1
      // On an arc: two-body exact. Elsewhere the spline's own accuracy on a slow step.
      expect(Math.hypot(p.x - truth.x, p.y - truth.y, p.z - truth.z)).toBeLessThan(
        turns ? 1e-8 : 1e-4,
      )
      expect(r(p)).toBeGreaterThan(Q * (1 - 1e-6))
    }
    expect(arcSteps).toBeGreaterThan(100)
  })

  it('draws the whole-mission path round perihelion, not through the Sun', () => {
    const points = trajectoryPoints(track)
    const minR = Math.min(...points.map(r))
    expect(minR).toBeGreaterThan(Q * 0.99)
    expect(minR).toBeLessThan(Q * 1.01)
    expect(minR / SUN_RADIUS_AU).toBeGreaterThan(9.7)
    // Dates rise along the path, for the past/future split.
    for (let i = 1; i < points.length; i += 1) {
      expect(points[i]?.jd ?? 0).toBeGreaterThan(points[i - 1]?.jd ?? Infinity)
    }
  })

  it('keeps each drawn sample, and adds points only where a step bends', () => {
    const points = trajectoryPoints(track)
    const samples = (track.coarse?.samples.length ?? 0) / 3
    const kept = points.filter(
      (p) => Math.abs((p.jd - START) / STEP - Math.round((p.jd - START) / STEP)) < 1e-9,
    )
    expect(kept).toHaveLength(samples)
    expect(points.length).toBeLessThan(samples * 12)
  })

  it('leaves a gently curving step to Catmull-Rom (keplerArcState answers null)', () => {
    const a = { x: 100, y: 0, z: 0 }
    const b = { x: 100, y: 0.5, z: 0 }
    expect(keplerArcState(a, b, 25, 0.5)).toBeNull()
  })
})

describe('the sense of motion comes from the track, not from ecliptic north (#262 review)', () => {
  // Retrograde (Halley-like, i = 162°) and polar versions of the same orbit: assuming
  // ecliptic north sent a retrograde step the long way round, through the Sun.
  for (const i of [162, 90]) {
    it(`follows a ${String(i)}° orbit round perihelion, never inside it`, () => {
      const el = { ...PARKER, i }
      const t = coarseTrack(el, START, 180)
      for (let jd = START; jd < START + 180; jd += 0.05) {
        const p = stateAt(t, jd)?.position
        if (!p) continue
        expect(r(p)).toBeGreaterThan(Q * (1 - 1e-6))
      }
      const truth = conicPosition(el, el.tp)
      const p = stateAt(t, el.tp)?.position ?? { x: 0, y: 0, z: 0 }
      expect(Math.hypot(p.x - truth.x, p.y - truth.y, p.z - truth.z)).toBeLessThan(1e-7)
      const minR = Math.min(...trajectoryPoints(t).map(r))
      expect(minR).toBeGreaterThan(Q * 0.99)
      expect(minR).toBeLessThan(Q * 1.01)
    })
  }

  it('gives ecliptic north and a retrograde north opposite sweeps for the same step', () => {
    const a = { x: 1, y: 0, z: 0 }
    const b = { x: 0.3, y: -0.52, z: 0 }
    expect(arcSweep(a, b)).toBeGreaterThan(Math.PI)
    expect(arcSweep(a, b, { x: 0, y: 0, z: -1 })).toBeLessThan(Math.PI)
  })
})
