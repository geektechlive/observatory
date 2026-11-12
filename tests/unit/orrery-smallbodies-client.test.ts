/**
 * The client side of /api/orrery-smallbodies (#99): the fetcher validates the payload
 * against the schema and reports degraded copies, for the renderer half to draw from.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchOrreryDwarfsEnvelope } from '@/lib/api/orreryDwarfs'
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

  it('never carries the dwarf planets: they have their own endpoint (#99 item 8)', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { ...PAYLOAD, dwarfs: [{ id: 'sb:20134340' }] }))
    expect('dwarfs' in (await fetchOrrerySmallBodiesEnvelope()).data).toBe(false)
  })

  it('rejects a payload that breaks the schema', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(200, { ...PAYLOAD, interstellar: [{ ...ATLAS, kind: 'moon' }] }),
    )
    await expect(fetchOrrerySmallBodiesEnvelope()).rejects.toBeTruthy()
  })
})

describe('fetchOrreryDwarfsEnvelope (#99 item 8)', () => {
  const pluto = {
    id: 'sb:20134340',
    spkid: '20134340',
    name: 'Pluto',
    target: 'Pluto Barycenter (9)',
    availableFrom: null,
    availableTo: null,
    coarse: { start: 625307.5, step: 1826, samples: [1, 2, 3, 4, 5, 6] },
  }
  const DWARFS_PAYLOAD = {
    generatedAt: '2026-11-12T04:00:00.000Z',
    coarseFetchedAt: '2026-11-12T04:00:00.000Z',
    frame: 'ecliptic-J2000',
    center: 'Sun',
    timeScale: 'TDB',
    units: { position: 'au' },
    sourceType: 'ephemeris',
    provider: 'jpl-horizons',
    dwarfs: [pluto],
    missing: [],
  }

  it('asks its own endpoint and keeps positions only, with the target Horizons named', async () => {
    const fetch = mockFetch(200, DWARFS_PAYLOAD)
    vi.stubGlobal('fetch', fetch)
    expect((await fetchOrreryDwarfsEnvelope()).data.dwarfs).toEqual([pluto])
    expect(String(fetch.mock.calls[0]?.[0])).toContain('/api/orrery-dwarfs')
  })

  it('rejects a body without a span', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(200, { ...DWARFS_PAYLOAD, dwarfs: [{ ...pluto, coarse: null }] }),
    )
    await expect(fetchOrreryDwarfsEnvelope()).rejects.toBeTruthy()
  })
})
