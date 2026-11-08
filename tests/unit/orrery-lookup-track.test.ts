import { describe, expect, it } from 'vitest'

import {
  describeLookup,
  isLookupKey,
  LOOKUP_STEP_DAYS,
  lookupKey,
  lookupOrbit,
  lookupSpan,
  lookupSpkid,
  spanSampleCount,
} from '@/lib/orrery/lookupTrack'
import type { SampledSpan } from '@/schemas/orreryBodies'

const DAY_MS = 86_400_000
const JD_UNIX = 2440587.5
const ms = (iso: string) => Date.parse(`${iso}T00:00:00Z`)
const jdOf = (t: number) => t / DAY_MS + JD_UNIX
/** Gauss's constant squared: the Sun's GM in au³/day². */
const MU = 0.01720209895 ** 2

/** A Kepler orbit in the ecliptic plane, sampled with position and velocity (stride 6). */
function keplerSpan(a: number, e: number, startJd: number, step: number, n: number): SampledSpan {
  const meanMotion = Math.sqrt(MU / a ** 3)
  const samples: number[] = []
  for (let i = 0; i < n; i += 1) {
    const M = meanMotion * i * step
    let E = M
    for (let k = 0; k < 30; k += 1) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E))
    const x = a * (Math.cos(E) - e)
    const y = a * Math.sqrt(1 - e * e) * Math.sin(E)
    const dE = meanMotion / (1 - e * Math.cos(E))
    samples.push(x, y, 0, -a * Math.sin(E) * dE, a * Math.sqrt(1 - e * e) * Math.cos(E) * dE, 0)
  }
  return { start: startJd, step, samples }
}

/** A straight-line flyby, the shape a hyperbolic visitor's span has far from the Sun. */
function lineSpan(startJd: number, step: number, n: number): SampledSpan {
  const samples: number[] = []
  for (let i = 0; i < n; i += 1) samples.push(3 + i * 0.05, 1, 0.2, 0.05 / step, 0, 0)
  return { start: startJd, step, samples }
}

describe('lookup keys (#145)', () => {
  it('names a looked-up object by its SPK-ID, and reads it back', () => {
    expect(lookupKey('20099942')).toBe('lookup:20099942')
    expect(lookupSpkid('lookup:20099942')).toBe('20099942')
    expect(isLookupKey('lookup:20099942')).toBe(true)
  })

  it('refuses anything that is not lookup:<digits>', () => {
    expect(lookupSpkid('naif:-31')).toBeNull()
    expect(lookupSpkid('lookup:')).toBeNull()
    expect(lookupSpkid('lookup:12a')).toBeNull()
    expect(lookupSpkid(`lookup:${'9'.repeat(20)}`)).toBeNull()
    expect(isLookupKey('Mars')).toBe(false)
  })
})

describe('lookupSpan (#145)', () => {
  it('asks two years at two-day steps, inside the endpoint’s 600-sample cap', () => {
    const span = lookupSpan(ms('2026-11-07'))
    expect(span).not.toBeNull()
    if (!span) return
    expect(span.step).toBe(`${String(LOOKUP_STEP_DAYS)}d`)
    expect(spanSampleCount(span)).toBeLessThanOrEqual(600)
    expect(spanSampleCount(span)).toBeGreaterThan(300)
  })

  it('keeps the date well inside the span, so a scrub of months needs no new request', () => {
    const t = ms('2026-11-07')
    const span = lookupSpan(t)
    if (!span) throw new Error('no span')
    expect(t - ms(span.start)).toBeGreaterThan(290 * DAY_MS)
    expect(ms(span.end) - t).toBeGreaterThan(290 * DAY_MS)
  })

  it('gives the same span for nearby dates (one cache entry for everyone) and moves in steps', () => {
    const a = lookupSpan(ms('2026-11-07'))
    const b = lookupSpan(ms('2026-11-08'))
    expect(b).toEqual(a)
    const far = lookupSpan(ms('2027-06-01'))
    expect(far?.start).not.toBe(a?.start)
  })

  it('stays inside 1900–2100 near the ends, and is null outside them', () => {
    const early = lookupSpan(ms('1900-03-01'))
    expect(early?.start).toBe('1900-01-01')
    expect(spanSampleCount(early ?? { start: '', end: '', step: '' })).toBeLessThanOrEqual(600)
    const late = lookupSpan(ms('2100-10-01'))
    expect(late?.end).toBe('2100-12-31')
    expect(lookupSpan(ms('1850-01-01'))).toBeNull()
    expect(lookupSpan(ms('2150-01-01'))).toBeNull()
  })
})

describe('describeLookup (#145)', () => {
  const start = jdOf(ms('2026-01-01'))
  const span = keplerSpan(1.5, 0.2, start, 2, 200)

  it('places the object from its samples: distance from the Sun and Earth, speed', () => {
    const d = describeLookup(span, null, start + 10)
    expect(d).not.toBeNull()
    if (!d) return
    expect(d.sunDistanceAu).toBeGreaterThan(1.5 * 0.8 - 0.01)
    expect(d.sunDistanceAu).toBeLessThan(1.5 * 1.2 + 0.01)
    expect(d.earthDistanceAu).toBeGreaterThan(0)
    expect(Number.isFinite(d.rangeRateKmS)).toBe(true)
    expect(d.lightTimeFromEarthS).toBeGreaterThan(0)
  })

  it('never extrapolates: null before the first sample or after the last', () => {
    expect(describeLookup(span, null, start - 1)).toBeNull()
    expect(describeLookup(span, null, start + 2 * 199 + 1)).toBeNull()
  })

  it('gives range rate as the change in distance from Earth: negative while approaching', () => {
    for (const day of [20, 120, 250, 380]) {
      const jd = start + day
      const before = describeLookup(span, null, jd - 0.5)?.earthDistanceAu ?? Number.NaN
      const after = describeLookup(span, null, jd + 0.5)?.earthDistanceAu ?? Number.NaN
      const numeric = ((after - before) * 149_597_870.7) / 86_400
      const rate = describeLookup(span, null, jd)?.rangeRateKmS ?? Number.NaN
      expect(Math.abs(rate - numeric)).toBeLessThan(0.05)
    }
  })
})

describe('lookupOrbit (#145)', () => {
  const start = jdOf(ms('2026-01-01'))

  it('draws an elliptic object’s whole orbit, the osculating ellipse through it now', () => {
    const span = keplerSpan(2.2, 0.3, start, 2, 200)
    const orbit = lookupOrbit(span, start + 100)
    expect(orbit?.kind).toBe('osculating')
    const pts = orbit?.points ?? []
    expect(pts.length).toBeGreaterThan(100)
    // The farthest point is the aphelion, a(1 + e).
    const far = Math.max(...pts.map((p) => Math.hypot(p.x, p.y, p.z)))
    expect(far).toBeCloseTo(2.2 * 1.3, 2)
    // The object's position now is the loop's first point.
    const now = describeLookup(span, null, start + 100)?.position
    expect(pts[0]?.x).toBeCloseTo(now?.x ?? Number.NaN, 6)
    expect(pts[0]?.y).toBeCloseTo(now?.y ?? Number.NaN, 6)
  })

  it('draws a hyperbolic (unbound) object along its sampled path instead', () => {
    const span = lineSpan(start, 2, 120)
    const orbit = lookupOrbit(span, start + 50)
    expect(orbit?.kind).toBe('sampled')
    expect(orbit?.points).toHaveLength(120)
  })

  it('is null when no sample covers the date', () => {
    expect(lookupOrbit(keplerSpan(2.2, 0.3, start, 2, 200), start - 5)).toBeNull()
  })
})
