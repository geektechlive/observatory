import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the shared cache/upstream helper for every endpoint under test here.
// `cachedJson` just runs the producer and hands back whatever it returns (a
// CacheableResult), so tests can assert on that value directly without
// standing up the real Cache API. `upstreamError` mirrors the real
// normalization (0 or >=520 -> 503, everything else -> 502) so tests can
// assert on the status code an endpoint actually causes.
vi.mock('../../../functions/api/_cache', () => {
  return {
    cachedJson: vi.fn(
      async (_ctx: unknown, _key: string, _ttl: number, produce: () => Promise<unknown>) =>
        produce(),
    ),
    fetchUpstream: vi.fn(),
    upstreamError: vi.fn((status: number, message: string) => {
      const normalized = status === 0 || status >= 520 ? 503 : 502
      return new Response(JSON.stringify({ error: message }), {
        status: normalized,
        headers: { 'Content-Type': 'application/json' },
      })
    }),
  }
})

import { fetchUpstream } from '../../../functions/api/_cache'
import { onRequest as aircraftHandler } from '../../../functions/api/aircraft'
import { onRequest as apodHandler } from '../../../functions/api/apod'
import { onRequest as quakesHandler } from '../../../functions/api/quakes'
import { onRequest as sunMoonHandler } from '../../../functions/api/sun-moon'

const mockFetchUpstream = vi.mocked(fetchUpstream)

// A fake CacheableResult, as returned by a mocked cachedJson (see above): a
// producer result object rather than an actual HTTP Response.
interface FakeProducerResult {
  body: string
  degraded?: boolean
}

// Minimal fake EventContext — every handler here only touches request.url,
// env and waitUntil. Bridged through `unknown` since the real EventContext
// type carries fields (params, data, next, functionPath, ...) this harness
// has no use for.
interface FakeCtx {
  request: { url: string }
  env: Record<string, unknown>
  waitUntil: (p: Promise<unknown>) => void
}

function makeCtx(url: string, env: Record<string, unknown> = {}): FakeCtx {
  return {
    request: { url },
    env,
    waitUntil: () => {
      // no-op — cachedJson is mocked and never calls waitUntil in these tests
    },
  }
}

function fakeResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

async function callSunMoon(ctx: FakeCtx) {
  return sunMoonHandler(ctx as unknown as Parameters<typeof sunMoonHandler>[0])
}

async function callApod(ctx: FakeCtx) {
  return apodHandler(ctx as unknown as Parameters<typeof apodHandler>[0])
}

async function callAircraft(ctx: FakeCtx) {
  return aircraftHandler(ctx as unknown as Parameters<typeof aircraftHandler>[0])
}

async function callQuakes(ctx: FakeCtx) {
  return quakesHandler(ctx as unknown as Parameters<typeof quakesHandler>[0])
}

beforeEach(() => {
  mockFetchUpstream.mockReset()
})

describe('sun-moon validation', () => {
  it('rejects lat outside [-90, 90] with 400', async () => {
    const ctx = makeCtx('https://observatory.test/api/sun-moon?lat=200&lon=0&date=2026-09-06')
    const res = await callSunMoon(ctx)
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json).toHaveProperty('error')
  })

  it('rejects lon outside [-180, 180] with 400', async () => {
    const ctx = makeCtx('https://observatory.test/api/sun-moon?lat=0&lon=200&date=2026-09-06')
    const res = await callSunMoon(ctx)
    expect(res.status).toBe(400)
  })

  it('rejects tz that is not a multiple of 0.25 with 400', async () => {
    const ctx = makeCtx('https://observatory.test/api/sun-moon?lat=0&lon=0&tz=1.1&date=2026-09-06')
    const res = await callSunMoon(ctx)
    expect(res.status).toBe(400)
  })

  it('rejects tz outside [-12, 14] with 400', async () => {
    const ctx = makeCtx('https://observatory.test/api/sun-moon?lat=0&lon=0&tz=15&date=2026-09-06')
    const res = await callSunMoon(ctx)
    expect(res.status).toBe(400)
  })

  it('rejects a date that fails the YYYY-MM-DD regex with 400', async () => {
    const ctx = makeCtx('https://observatory.test/api/sun-moon?lat=0&lon=0&date=09-06-2026')
    const res = await callSunMoon(ctx)
    expect(res.status).toBe(400)
  })

  it('rounds lat/lon to 2 decimals for the upstream URL on a valid request', async () => {
    mockFetchUpstream.mockResolvedValue(
      fakeResponse(200, {
        properties: {
          data: { curphase: 'Full Moon', fracillum: '100', sundata: [], moondata: [] },
        },
      }),
    )
    const ctx = makeCtx(
      'https://observatory.test/api/sun-moon?lat=40.123456&lon=-74.987654&tz=-4.5&date=2026-09-06',
    )
    const raw = await callSunMoon(ctx)
    const result = raw as unknown as FakeProducerResult
    expect(mockFetchUpstream).toHaveBeenCalledTimes(1)
    const calledUrl = mockFetchUpstream.mock.calls[0]?.[0] as string
    expect(calledUrl).toContain('coords=40.12,-74.99')
    const parsed = JSON.parse(result.body) as { lat: number; lon: number }
    expect(parsed.lat).toBe(40.12)
    expect(parsed.lon).toBe(-74.99)
  })
})

describe('apod', () => {
  it('keeps an allowlisted url/hdurl and nulls a disallowed one', async () => {
    mockFetchUpstream.mockResolvedValue(
      fakeResponse(
        200,
        {
          date: '2026-09-06',
          title: 'Test APOD',
          explanation: 'A test image',
          url: 'https://apod.nasa.gov/apod/image/test.jpg',
          hdurl: 'https://evil.example.com/hd.jpg',
          media_type: 'image',
          service_version: 'v1',
        },
        { 'X-RateLimit-Remaining': '1000' },
      ),
    )
    const ctx = makeCtx('https://observatory.test/api/apod', { NASA_API_KEY: 'realkey' })
    const raw = await callApod(ctx)
    const result = raw as unknown as FakeProducerResult
    const body = JSON.parse(result.body) as { url: string | null; hdurl: string | null }
    expect(body.url).toBe('https://apod.nasa.gov/apod/image/test.jpg')
    expect(body.hdurl).toBeNull()
  })

  it('falls back to DEMO_KEY when NASA_API_KEY is an empty string', async () => {
    mockFetchUpstream.mockResolvedValue(
      fakeResponse(200, {
        date: '2026-09-06',
        title: 'Test APOD',
        explanation: 'A test image',
        url: 'https://apod.nasa.gov/apod/image/test.jpg',
        media_type: 'image',
        service_version: 'v1',
      }),
    )
    const ctx = makeCtx('https://observatory.test/api/apod', { NASA_API_KEY: '' })
    await callApod(ctx)
    const calledUrl = mockFetchUpstream.mock.calls[0]?.[0] as string
    expect(calledUrl).toContain('api_key=DEMO_KEY')
  })
})

describe('aircraft fan-out', () => {
  it('degrades when one region fails but still returns data from the rest', async () => {
    let call = 0
    mockFetchUpstream.mockImplementation(() => {
      call += 1
      const n = call
      if (n === 1) return Promise.reject(new Error('region timed out'))
      return Promise.resolve(
        fakeResponse(200, { ac: [{ hex: `abc${n}`, lat: 10 + n, lon: 20 + n, flight: `FL${n}` }] }),
      )
    })
    const ctx = makeCtx('https://observatory.test/api/aircraft')
    const raw = await callAircraft(ctx)
    const result = raw as unknown as FakeProducerResult
    expect(result.degraded).toBe(true)
    const body = JSON.parse(result.body) as { aircraft: unknown[] }
    // 8 regions total, 1 failed -> 7 succeed
    expect(body.aircraft.length).toBe(7)
  })

  it('is not degraded when every region succeeds', async () => {
    let call = 0
    mockFetchUpstream.mockImplementation(() => {
      call += 1
      const n = call
      return Promise.resolve(
        fakeResponse(200, { ac: [{ hex: `abc${n}`, lat: 10 + n, lon: 20 + n, flight: `FL${n}` }] }),
      )
    })
    const ctx = makeCtx('https://observatory.test/api/aircraft')
    const raw = await callAircraft(ctx)
    const result = raw as unknown as FakeProducerResult
    expect(result.degraded).toBe(false)
  })
})

describe('quakes upstream error', () => {
  it('returns a 502 body without a details field when USGS is non-2xx', async () => {
    mockFetchUpstream.mockResolvedValue(fakeResponse(500, { error: 'upstream said no' }))
    const ctx = makeCtx('https://observatory.test/api/quakes')
    const res = await callQuakes(ctx)
    expect(res.status).toBe(502)
    const json = await res.json()
    expect(json).toHaveProperty('error')
    expect(json).not.toHaveProperty('details')
  })
})
