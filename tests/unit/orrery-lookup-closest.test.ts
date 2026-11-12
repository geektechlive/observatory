/**
 * A looked-up object's close pass drawn from a dense span (#215). 2026 VQ11 passed
 * 31,453 km from Earth's centre on 11 November 2026 (JPL CAD; Horizons' 1-minute vectors
 * give 31,453.4 km). Its 2-day lookup samples draw that 39% short. The fixture holds those
 * samples (trimmed to ±13 days), the 10-minute span /api/trajectory asks for around the
 * pass (four days, grid-aligned), Horizons' daily Earth, and the 1-minute truth.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { stateAt } from '@/lib/orrery/ephemeris'
import {
  CLOSEST_MAX_AU,
  describeLookup,
  lookupClosestSpan,
  lookupNearTimes,
  lookupState,
  spanSampleCount,
} from '@/lib/orrery/lookupTrack'
import type { Vec3 } from '@/lib/orrery/scale'
import type { OrreryTrack, SampledSpan } from '@/schemas/orreryBodies'

const AU_KM = 149_597_870.7
const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'jpl-lookup', 'vq11-pass.json'), 'utf8'),
) as {
  cadJd: number
  cadAu: number
  coarse: SampledSpan
  dense: SampledSpan
  earth: OrreryTrack
  truth: { minKm: number; minJd: number; points: { jd: number; km: number }[] }
}
const earthFine = fixture.earth.fine as SampledSpan
const earthAt = (jd: number): Vec3 | null =>
  stateAt({ fine: earthFine, coarse: null }, jd)?.position ?? null

/** The drawn distance from Earth, km, on the pass the orrery draws (lookupNearTimes). */
function drawnClosestKm(closest: SampledSpan | null): number {
  const times = lookupNearTimes(fixture.coarse, earthAt, 0.1, 240, closest)
  let best = Infinity
  for (const jd of times) {
    const d = describeLookup(fixture.coarse, fixture.earth, jd, closest)
    if (d) best = Math.min(best, d.earthDistanceAu * AU_KM)
  }
  return best
}

describe('a looked-up object passing Earth (#215)', () => {
  it('asks for four grid-aligned days at 10 minutes around the pass, under the 600-sample cap', () => {
    const span = lookupClosestSpan(fixture.coarse, earthAt)
    expect(span).toEqual({ start: '2026-11-10', end: '2026-11-14', step: '10m' })
    expect(spanSampleCount(span ?? { start: '', end: '', step: '' })).toBe(577)
    // The span's ends are lookup samples, so the hand-over is at a shared Horizons state.
    expect(fixture.dense.start).toBeCloseTo(2461354.5, 6)
  })

  it('asks nothing for an object that stays beyond 0.001 au', () => {
    // Earth moved 0.002 au across the pass's line (perpendicular to the relative velocity):
    // the same pass, now missing by about 0.002 au.
    const o = stateAt({ fine: fixture.coarse, coarse: null }, fixture.cadJd)?.velocity
    const e = stateAt({ fine: earthFine, coarse: null }, fixture.cadJd)?.velocity
    const v = {
      x: (o?.x ?? 0) - (e?.x ?? 0),
      y: (o?.y ?? 0) - (e?.y ?? 0),
      z: (o?.z ?? 0) - (e?.z ?? 0),
    }
    const n = { x: v.y, y: -v.x, z: 0 }
    const k = 0.002 / Math.hypot(n.x, n.y)
    const away = (jd: number): Vec3 | null => {
      const p = earthAt(jd)
      return p ? { x: p.x + n.x * k, y: p.y + n.y * k, z: p.z } : null
    }
    expect(lookupClosestSpan(fixture.coarse, away, 0.0015)).toBeNull()
    expect(CLOSEST_MAX_AU).toBe(0.001)
    expect(lookupClosestSpan(fixture.coarse, away)).toBeNull()
  })

  it('asks nothing when the pass is at the very edge of the span', () => {
    const n = fixture.coarse.samples.length / 6
    // Only the samples up to the pass: the nearest one is the last, so no window fits.
    const cut = 7
    const head: SampledSpan = {
      ...fixture.coarse,
      samples: fixture.coarse.samples.slice(0, cut * 6),
    }
    expect(n).toBeGreaterThan(cut)
    expect(lookupClosestSpan(head, earthAt)).toBeNull()
  })

  it('without the dense span, the 2-day samples draw VQ11 over 30% short', () => {
    const km = drawnClosestKm(null)
    expect((km - fixture.truth.minKm) / fixture.truth.minKm).toBeLessThan(-0.3)
  })

  it('with it, draws the closest distance within 0.1% of Horizons’ 1-minute vectors and CAD', () => {
    const km = drawnClosestKm(fixture.dense)
    expect(Math.abs(km - fixture.truth.minKm) / fixture.truth.minKm).toBeLessThan(0.001)
    const cadKm = fixture.cadAu * AU_KM
    expect(Math.abs(km - cadKm) / cadKm).toBeLessThan(0.001)
  })

  it('matches the 1-minute vectors over ±2 days of the pass within 0.2% (or 30 km)', () => {
    for (const p of fixture.truth.points) {
      const d = describeLookup(fixture.coarse, fixture.earth, p.jd, fixture.dense)
      const km = (d?.earthDistanceAu ?? 0) * AU_KM
      expect(Math.abs(km - p.km)).toBeLessThan(Math.max(30, p.km * 0.002))
    }
  })

  it('uses the dense span inside it and the 2-day samples outside, never past either', () => {
    const samples = { fine: fixture.coarse, closest: fixture.dense }
    const inside = fixture.cadJd
    expect(lookupState(samples, inside)).toEqual(
      stateAt({ fine: fixture.dense, coarse: null }, inside),
    )
    const outside = fixture.dense.start - 3
    expect(lookupState(samples, outside)).toEqual(
      stateAt({ fine: fixture.coarse, coarse: null }, outside),
    )
    const last =
      fixture.coarse.start + (fixture.coarse.samples.length / 6 - 1) * fixture.coarse.step
    expect(lookupState(samples, last + 0.01)).toBeNull()
    expect(lookupState(samples, fixture.coarse.start - 0.01)).toBeNull()
  })
})
