/**
 * Moon orbit lines (#107): a closed loop of planet-centred points, sampled from the
 * moon's own Horizons data over one period, or, when the data window is shorter than a
 * period, the osculating ellipse from the current state (and said so). Either way the
 * moon's position now lies on its line.
 */
import { describe, expect, it } from 'vitest'

import { moonOrbit } from '@/lib/orrery/moonOrbit'
import type { MoonBody } from '@/lib/orrery/moonState'
import type { Vec3 } from '@/lib/orrery/scale'
import { AU_KM } from '@/lib/orrery/units'

/** An eccentric, inclined test orbit around the origin, valid for jd in [from, to]. */
function ellipseMoon(
  periodDays: number,
  aKm: number,
  e: number,
  from: number,
  to: number,
): MoonBody {
  const a = aKm / AU_KM
  const n = (2 * Math.PI) / periodDays
  const tilt = 0.4
  const state = (jd: number) => {
    // Kepler's equation by Newton, then the position and its time derivative.
    const M = n * jd
    let E = M
    for (let i = 0; i < 30; i += 1) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
    const x = a * (Math.cos(E) - e)
    const y = a * Math.sqrt(1 - e * e) * Math.sin(E)
    const dE = n / (1 - e * Math.cos(E))
    const vx = -a * Math.sin(E) * dE
    const vy = a * Math.sqrt(1 - e * e) * Math.cos(E) * dE
    return {
      position: { x, y: y * Math.cos(tilt), z: y * Math.sin(tilt) },
      velocity: { x: vx, y: vy * Math.cos(tilt), z: vy * Math.sin(tilt) },
      resolution: 'fine' as const,
    }
  }
  return {
    key: 'naif:test',
    name: 'Test',
    parent: 'Jupiter',
    periodDays,
    semiMajorAxisKm: aKm,
    center: 'test',
    target: null,
    spans: [{ start: from, step: 1, samples: new Array((Math.floor(to - from) + 1) * 6).fill(0) }],
    relative: (jd) => (jd >= from && jd <= to ? state(jd) : null),
  }
}

/** Distance from p to the nearest segment of the closed loop. */
function distanceToLoop(p: Vec3, loop: readonly Vec3[]): number {
  let best = Infinity
  for (let i = 0; i < loop.length; i += 1) {
    const a = loop[i] as Vec3
    const b = loop[(i + 1) % loop.length] as Vec3
    const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }
    const ap = { x: p.x - a.x, y: p.y - a.y, z: p.z - a.z }
    const len2 = ab.x * ab.x + ab.y * ab.y + ab.z * ab.z
    const t =
      len2 === 0 ? 0 : Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y + ap.z * ab.z) / len2))
    best = Math.min(best, Math.hypot(ap.x - ab.x * t, ap.y - ab.y * t, ap.z - ab.z * t))
  }
  return best
}

const at = (m: MoonBody, jd: number) => m.relative(jd)?.position ?? { x: 0, y: 0, z: 0 }

describe('moonOrbit', () => {
  it('samples one period from the data when the window covers it, through the moon now', () => {
    const io = ellipseMoon(1.77, 422_000, 0.05, 0, 30)
    const orbit = moonOrbit(io, 12.3)
    expect(orbit?.kind).toBe('sampled')
    const loop = orbit?.points ?? []
    expect(loop.length).toBeGreaterThan(60)
    const a = 422_000 / AU_KM
    expect(distanceToLoop(at(io, 12.3), loop)).toBeLessThan(a * 0.002)
  })

  it('still covers a whole period near the edge of the window', () => {
    const io = ellipseMoon(1.77, 422_000, 0.05, 0, 30)
    const orbit = moonOrbit(io, 0.1)
    expect(orbit?.kind).toBe('sampled')
    expect(distanceToLoop(at(io, 0.1), orbit?.points ?? [])).toBeLessThan((422_000 / AU_KM) * 0.002)
  })

  it('falls back to the osculating ellipse when the window is shorter than a period (Iapetus)', () => {
    const iapetus = ellipseMoon(79.33, 3_560_840, 0.03, 0, 30)
    const orbit = moonOrbit(iapetus, 15)
    expect(orbit?.kind).toBe('osculating')
    const loop = orbit?.points ?? []
    const a = 3_560_840 / AU_KM
    expect(distanceToLoop(at(iapetus, 15), loop)).toBeLessThan(a * 0.002)
    // A whole ellipse of about the right size: every point within (1 ± e) a, roughly.
    for (const p of loop) {
      const r = Math.hypot(p.x, p.y, p.z)
      expect(r).toBeGreaterThan(a * 0.95)
      expect(r).toBeLessThan(a * 1.05)
    }
  })

  it('puts the moon on a vertex and never jumps across the loop (no stray chord)', () => {
    for (const [moon, jd] of [
      [ellipseMoon(1.77, 422_000, 0.05, 0, 30), 0.1],
      [ellipseMoon(1.77, 422_000, 0.05, 0, 30), 29.95],
      [ellipseMoon(79.33, 3_560_840, 0.03, 0, 30), 15],
    ] as const) {
      const loop = moonOrbit(moon, jd)?.points ?? []
      const a = moon.semiMajorAxisKm / AU_KM
      const now = at(moon, jd)
      const nearest = Math.min(
        ...loop.map((p) => Math.hypot(p.x - now.x, p.y - now.y, p.z - now.z)),
      )
      expect(nearest).toBeLessThan(a * 1e-6)
      const arc = (2 * Math.PI * a) / loop.length
      for (let i = 0; i < loop.length; i += 1) {
        const p = loop[i] as Vec3
        const q = loop[(i + 1) % loop.length] as Vec3
        expect(Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z)).toBeLessThan(arc * 2)
      }
    }
  })

  it('has no orbit outside the data: never extrapolated', () => {
    const io = ellipseMoon(1.77, 422_000, 0.05, 0, 30)
    expect(moonOrbit(io, 40)).toBeNull()
  })
})
