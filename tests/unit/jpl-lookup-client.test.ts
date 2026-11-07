import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  fetchLookup,
  fetchTrajectoryAround,
  fetchTrajectorySpan,
  trajectoryFacts,
  trajectoryWindow,
} from '@/lib/api/jplLookup'
import type { TrajectoryResponse } from '@/schemas/jplLookup'

// The orrery search's on-demand lookup client (#100).

const ok = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 }))

afterEach(() => {
  vi.unstubAllGlobals()
})

const object = {
  id: 'sb:20000433',
  spkid: '20000433',
  name: '433 Eros (A898 PA)',
  designation: '433',
  prefix: null,
  kind: 'asteroid' as const,
  orbitClass: { code: 'AMO', name: 'Amor' },
  neo: true,
  pha: false,
}

describe('fetchLookup', () => {
  it('asks /api/lookup with the query encoded and validates the answer', async () => {
    const fetch = ok({ query: '2026 VP*', provider: 'jpl-sbdb', result: { type: 'none' } })
    vi.stubGlobal('fetch', fetch)
    const r = await fetchLookup('2026 VP*')
    expect(fetch).toHaveBeenCalledWith('/api/lookup?q=2026%20VP*', undefined)
    expect(r).toEqual({
      state: 'ok',
      data: { query: '2026 VP*', provider: 'jpl-sbdb', result: { type: 'none' } },
    })
  })

  it('says "not set up", "busy" or "failed" instead of throwing', async () => {
    const answer = (status: number, headers: Record<string, string> = {}) =>
      vi.fn(async () => new Response('{"error":"x"}', { status, headers }))
    vi.stubGlobal('fetch', answer(503, { 'X-Not-Configured': 'jpl-queue' }))
    expect(await fetchLookup('eros')).toEqual({ state: 'unavailable', reason: 'not-set-up' })
    vi.stubGlobal('fetch', answer(503))
    expect(await fetchLookup('eros')).toEqual({ state: 'unavailable', reason: 'busy' })
    vi.stubGlobal('fetch', answer(500))
    expect(await fetchLookup('eros')).toEqual({ state: 'unavailable', reason: 'failed' })
    vi.stubGlobal('fetch', ok({ unexpected: true }))
    expect(await fetchLookup('eros')).toEqual({ state: 'unavailable', reason: 'failed' })
  })
})

describe('trajectoryWindow', () => {
  it('asks a day either side of the date, so repeat searches share a cache entry', () => {
    const jd = 2461352.3 // 2026-11-07 19:12 TDB
    expect(trajectoryWindow(jd)).toEqual({ start: '2026-11-06', end: '2026-11-08' })
  })

  it('refuses dates outside 1900–2100', () => {
    expect(trajectoryWindow(2415000)).toBeNull() // 1899
    expect(trajectoryWindow(2488500)).toBeNull() // 2101
  })
})

describe('fetchTrajectoryAround', () => {
  it('asks /api/trajectory for three daily samples', async () => {
    const fetch = vi.fn(async () => new Response('{}', { status: 404 }))
    vi.stubGlobal('fetch', fetch)
    const r = await fetchTrajectoryAround('sb:20000433', 2461352.3)
    expect(fetch).toHaveBeenCalledWith(
      '/api/trajectory?id=sb%3A20000433&start=2026-11-06&end=2026-11-08&step=1d',
      undefined,
    )
    expect(r).toEqual({ state: 'unavailable', reason: 'not-found' })
  })

  it('does not ask for a date it cannot serve', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    expect(await fetchTrajectoryAround('sb:1', 2415000)).toEqual({
      state: 'unavailable',
      reason: 'out-of-range',
    })
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('fetchTrajectorySpan (#145)', () => {
  it('asks /api/trajectory for the span the orrery draws', async () => {
    const fetch = vi.fn(async () => new Response('{}', { status: 500 }))
    vi.stubGlobal('fetch', fetch)
    await fetchTrajectorySpan('sb:2099942', { start: '2025-12-04', end: '2027-12-04', step: '2d' })
    expect(fetch).toHaveBeenCalledWith(
      '/api/trajectory?id=sb%3A2099942&start=2025-12-04&end=2027-12-04&step=2d',
      undefined,
    )
  })

  it('passes on how long a busy queue asks to wait, and says when JPL has no such object', async () => {
    const answer = (status: number, headers: Record<string, string> = {}) =>
      vi.fn(async () => new Response('{"error":"x"}', { status, headers }))
    const span = { start: '2025-12-04', end: '2027-12-04', step: '2d' }
    vi.stubGlobal('fetch', answer(503, { 'Retry-After': '20' }))
    expect(await fetchTrajectorySpan('sb:1', span)).toEqual({
      state: 'unavailable',
      reason: 'busy',
      retryAfterS: 20,
    })
    vi.stubGlobal('fetch', answer(404))
    expect(await fetchTrajectorySpan('sb:1', span)).toEqual({
      state: 'unavailable',
      reason: 'not-found',
    })
  })
})

describe('trajectoryFacts', () => {
  // Eros's own Horizons vectors for 2026-11-01..03 (fixtures/jpl-lookup/horizons-eros.json).
  const t: TrajectoryResponse = {
    generatedAt: '2026-11-07T00:00:00Z',
    frame: 'ecliptic-J2000',
    center: 'Sun',
    timeScale: 'TDB',
    units: { position: 'au', velocity: 'au/day' },
    sourceType: 'ephemeris',
    provider: 'jpl-horizons',
    object,
    target: '433 Eros (A898 PA)',
    request: { start: '2026-11-01', end: '2026-11-03', stepMinutes: 1440 },
    fine: {
      start: 2461345.5,
      step: 1,
      samples: [
        0.2863368944893412, -1.710461176296138, -0.1389562053649563, 0.01155639883622628,
        0.0004308015385776098, 0.001873169473944048, 0.297885147524694, -1.70998236296689,
        -0.1370791524300279, 0.01154000542890535, 0.0005267842587067376, 0.00188091590131454,
        0.3094167022667106, -1.709407689718742, -0.1351944144913556, 0.01152300277870876,
        0.0006225211594496207, 0.001888539541419831,
      ],
    },
    availableFrom: null,
    availableTo: null,
  }

  it('reads the sample nearest the date: distance from the Sun and Earth, and speed', () => {
    const f = trajectoryFacts(t, 2461346.6)
    expect(f?.sampleJd).toBe(2461346.5)
    // |r| of the 2026-11-02 sample.
    expect(f?.sunAu).toBeCloseTo(
      Math.hypot(0.297885147524694, -1.70998236296689, -0.1370791524300279),
      9,
    )
    // |v| in km/s: au/day x 149,597,870.7 / 86,400.
    const v = Math.hypot(0.01154000542890535, 0.0005267842587067376, 0.00188091590131454)
    expect(f?.speedKmS).toBeCloseTo((v * 149_597_870.7) / 86_400, 6)
    expect(f?.earthAu).toBeGreaterThan(0.5)
    expect(f?.earthAu).toBeLessThan(3.5)
  })

  it('has nothing to say without samples', () => {
    expect(trajectoryFacts({ ...t, fine: null }, 2461346.6)).toBeNull()
  })
})
