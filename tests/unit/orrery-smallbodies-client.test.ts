/**
 * The client side of /api/orrery-smallbodies (#99): the fetcher validates the payload
 * against the schema and reports degraded copies, for the renderer half to draw from.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchOrrerySmallBodiesEnvelope } from '@/lib/api/orrerySmallBodies'

function mockFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  const headersMap = new Map(Object.entries(headers))
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: { get: (k: string) => headersMap.get(k) ?? null },
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const ATLAS = {
  id: 'sb:1004083',
  spkid: '1004083',
  des: 'C/2025 N1',
  name: '3I/ATLAS',
  kind: 'comet',
  interstellar: true,
  discovered: '2025-07-01',
  magnitude: null,
  m1: 11.8,
  k1: 7.5,
  h: null,
  elements: {
    epochJd: 2461340.5,
    e: 6.1235,
    q: 1.352,
    tp: 2460977.94,
    om: 323.03,
    w: 128.8,
    i: 175.24,
  },
  elementsSource: 'horizons',
  vInfKms: 58,
  solution: {
    ref: 'JPL#55',
    date: '2026-10-21',
    observations: 117,
    dataArc: { from: '2025-10-03', to: '2026-10-16' },
  },
  target: 'ATLAS (C/2025 N1)',
  availableFrom: null,
  availableTo: null,
  fine: { start: 2461322.5, step: 1, samples: [-2.6, 12.5, -0.7, 0, 0.034, -0.002] },
  coarse: { start: 2459882.5, step: 5, samples: [1, 2, 3] },
}

const PAYLOAD = {
  generatedAt: '2026-11-07T04:00:00.000Z',
  coarseFetchedAt: '2026-11-07T04:00:00.000Z',
  frame: 'ecliptic-J2000',
  center: 'Sun',
  timeScale: 'TDB',
  units: { position: 'au', velocity: 'au/day' },
  sourceType: 'ephemeris',
  provider: 'jpl-horizons',
  comets: [],
  interstellar: [ATLAS],
  missing: [{ id: 'jpl-sbdb-query', reason: 'HTTP 503' }],
}

describe('fetchOrrerySmallBodiesEnvelope', () => {
  it('validates the payload and keeps each object', async () => {
    vi.stubGlobal('fetch', mockFetch(200, PAYLOAD))
    const envelope = await fetchOrrerySmallBodiesEnvelope()
    expect(envelope.data.interstellar[0]?.vInfKms).toBe(58)
    expect(envelope.data.comets).toEqual([])
    expect(envelope.degraded).toBe(false)
  })

  it('reports a degraded copy', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(200, PAYLOAD, { 'X-Data-Degraded': '1', 'X-Data-Age': String(80 * 3600) }),
    )
    expect((await fetchOrrerySmallBodiesEnvelope()).degraded).toBe(true)
  })

  it('rejects a payload that breaks the schema', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(200, { ...PAYLOAD, interstellar: [{ ...ATLAS, kind: 'moon' }] }),
    )
    await expect(fetchOrrerySmallBodiesEnvelope()).rejects.toBeTruthy()
  })
})
