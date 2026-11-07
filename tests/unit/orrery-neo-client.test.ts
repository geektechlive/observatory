/**
 * The client side of /api/orrery-neo (#92): the fetcher validates the payload against
 * the schema and reports degraded copies, for the renderer half to draw from.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'

import { fetchOrreryNeoEnvelope } from '@/lib/api/orreryNeo'

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

const PAYLOAD = {
  generatedAt: '2026-11-07T04:00:00.000Z',
  frame: 'ecliptic-J2000',
  center: 'Sun',
  timeScale: 'TDB',
  units: { position: 'au', velocity: 'au/day' },
  sourceType: 'ephemeris',
  provider: 'jpl-horizons',
  window: { from: '2026-10-28', to: '2026-11-17' },
  approaches: [
    {
      id: 'sb:2026 UE2',
      des: '2026 UE2',
      name: '(2026 UE2)',
      orbitId: '4',
      pha: false,
      riskListed: false,
      h: 29.337,
      diameterKm: null,
      closeApproach: {
        jd: 2461342.559430817,
        date: '2026-10-29T01:26:00.000Z',
        distAu: 0.000827,
        distMinAu: 0.000826,
        distMaxAu: 0.000828,
        vRelKms: 7.67,
        vInfKms: 7.24,
        tSigma: '< 00:01',
      },
      target: '(2026 UE2)',
      fine: { start: 2461341.5, step: 0.125, samples: [1, 0.5, 0, 0, 0.017, 0] },
    },
  ],
  scout: null,
  esa: { riskList: null, closeApproaches: null },
  missing: [{ id: 'jpl-scout', reason: 'HTTP 503' }],
}

describe('fetchOrreryNeoEnvelope', () => {
  it('validates the payload and keeps every approach', async () => {
    vi.stubGlobal('fetch', mockFetch(200, PAYLOAD))
    const envelope = await fetchOrreryNeoEnvelope()
    expect(envelope.data.approaches[0]?.des).toBe('2026 UE2')
    expect(envelope.data.scout).toBeNull()
    expect(envelope.degraded).toBe(false)
  })

  it('reports a degraded copy', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(200, PAYLOAD, { 'X-Data-Degraded': '1', 'X-Data-Age': String(40 * 3600) }),
    )
    const envelope = await fetchOrreryNeoEnvelope()
    expect(envelope.degraded).toBe(true)
  })

  it('rejects a payload that breaks the schema', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { ...PAYLOAD, approaches: [{ des: 1 }] }))
    await expect(fetchOrreryNeoEnvelope()).rejects.toBeTruthy()
  })
})
