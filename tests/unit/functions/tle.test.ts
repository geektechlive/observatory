import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The real _cache module talks to the Cloudflare Cache API, which does not exist in
// this environment. Mock it with a factory so the module is never loaded: these tests
// exercise the KV-first producers, not the cache wrapper.
vi.mock('../../../functions/api/_cache', () => ({
  cachedJson: vi.fn(),
  fetchUpstream: vi.fn(),
  upstreamError: vi.fn(),
}))

const { fetchUpstream } = await import('../../../functions/api/_cache')
const { FALLBACK_TLE, KV_ISS_TLE_KEY, KV_MAX_AGE_SECONDS, produceIssTle, readKvEnvelope } =
  await import('../../../functions/api/iss-tle')
const { KV_SATELLITES_KEY, buildSatellitesBody, produceSatellites } =
  await import('../../../functions/api/satellites')

const ISS_TLE = {
  name: 'ISS (ZARYA)',
  line1: '1 25544U 98067A   26250.17589239  .00004561  00000+0  90859-4 0  9999',
  line2: '2 25544  51.6308 254.3052 0005020 115.4261 244.7248 15.49013499584466',
}

const NOW = Date.parse('2026-09-07T00:00:00.000Z')
const HOUR_MS = 3600_000
const TEN_DAYS_MS = 10 * 24 * HOUR_MS

function fakeKv(entries: Record<string, string>) {
  return {
    get: (key: string) => Promise.resolve(entries[key] ?? null),
  }
}

function envelope(data: unknown, fetchedAt: string): string {
  return JSON.stringify({ fetchedAt, source: 'celestrak', data })
}

// A producer result is either a Response (uncached passthrough) or a payload object.
type Payload = {
  body: string
  ttl?: number
  degraded?: boolean
  extraHeaders?: Record<string, string>
}

function asPayload(result: unknown): Payload {
  // A cacheable payload, not the raw-Response passthrough branch. Checked
  // structurally so the test does not depend on a global Response.
  expect(typeof (result as Payload).body).toBe('string')
  return result as Payload
}

// CelesTrak blocks Workers egress and its usage policy says to stop on any non-200
// (#214), so neither Function may ask it anything on the request path. Every test
// below spies on both ways a Function could reach the network.
let globalFetch: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  globalFetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('no network in tests'))
})

afterEach(() => {
  globalFetch.mockRestore()
})

function expectNoUpstreamRequest() {
  expect(fetchUpstream).not.toHaveBeenCalled()
  expect(globalFetch).not.toHaveBeenCalled()
}

describe('readKvEnvelope', () => {
  it('returns null when there is no KV binding', async () => {
    expect(await readKvEnvelope(undefined, KV_ISS_TLE_KEY, NOW)).toBeNull()
  })

  it('returns null when the key is missing', async () => {
    expect(await readKvEnvelope(fakeKv({}), KV_ISS_TLE_KEY, NOW)).toBeNull()
  })

  it('returns null for a non-JSON value', async () => {
    const kv = fakeKv({ [KV_ISS_TLE_KEY]: 'not json' })
    expect(await readKvEnvelope(kv, KV_ISS_TLE_KEY, NOW)).toBeNull()
  })

  it('returns null when the envelope has no fetchedAt', async () => {
    const kv = fakeKv({ [KV_ISS_TLE_KEY]: JSON.stringify({ data: ISS_TLE }) })
    expect(await readKvEnvelope(kv, KV_ISS_TLE_KEY, NOW)).toBeNull()
  })

  it('marks a recent envelope fresh and reports its age', async () => {
    const fetchedAt = new Date(NOW - 2 * HOUR_MS).toISOString()
    const kv = fakeKv({ [KV_ISS_TLE_KEY]: envelope(ISS_TLE, fetchedAt) })

    const hit = await readKvEnvelope(kv, KV_ISS_TLE_KEY, NOW)

    expect(hit?.fresh).toBe(true)
    expect(hit?.ageSeconds).toBe(7200)
    expect(hit?.data).toEqual(ISS_TLE)
  })

  it('marks an envelope older than the freshness window stale', async () => {
    const fetchedAt = new Date(NOW - (KV_MAX_AGE_SECONDS + 60) * 1000).toISOString()
    const kv = fakeKv({ [KV_ISS_TLE_KEY]: envelope(ISS_TLE, fetchedAt) })

    const hit = await readKvEnvelope(kv, KV_ISS_TLE_KEY, NOW)

    expect(hit?.fresh).toBe(false)
  })

  it('survives a KV read that throws', async () => {
    const kv = { get: () => Promise.reject(new Error('kv down')) }
    expect(await readKvEnvelope(kv, KV_ISS_TLE_KEY, NOW)).toBeNull()
  })
})

describe('produceIssTle', () => {
  it('serves fresh KV without touching the network', async () => {
    const kv = fakeKv({
      [KV_ISS_TLE_KEY]: envelope(ISS_TLE, new Date(NOW - HOUR_MS).toISOString()),
    })

    const payload = asPayload(await produceIssTle(kv, NOW))

    expectNoUpstreamRequest()
    expect(JSON.parse(payload.body)).toEqual(ISS_TLE)
    expect(payload.degraded).toBeUndefined()
    expect(payload.extraHeaders?.['X-Data-Source']).toBe('kv')
    expect(payload.extraHeaders?.['X-Data-Age']).toBe('3600')
    expect(payload.ttl).toBe(3600)
  })

  it('serves stale KV, marked degraded, without asking CelesTrak', async () => {
    const fetchedAt = new Date(NOW - TEN_DAYS_MS).toISOString()
    const kv = fakeKv({ [KV_ISS_TLE_KEY]: envelope(ISS_TLE, fetchedAt) })

    const payload = asPayload(await produceIssTle(kv, NOW))

    expectNoUpstreamRequest()
    expect(payload.degraded).toBe(true)
    expect(payload.extraHeaders?.['X-Data-Source']).toBe('kv-stale')
    expect(payload.extraHeaders?.['X-Error-Kind']).toBe('upstream')
    expect(payload.extraHeaders?.['X-Data-Age']).toBe(String(TEN_DAYS_MS / 1000))
    expect(payload.ttl).toBe(300)
    expect(JSON.parse(payload.body)).toEqual(ISS_TLE)
  })

  it('serves the hardcoded fallback, without asking CelesTrak, when KV is missing', async () => {
    const payload = asPayload(await produceIssTle(fakeKv({}), NOW))

    expectNoUpstreamRequest()
    expect(payload.degraded).toBe(true)
    expect(payload.extraHeaders?.['X-Data-Source']).toBe('fallback')
    expect(payload.extraHeaders?.['X-Error-Kind']).toBe('upstream')
    expect(payload.ttl).toBe(300)
    expect(JSON.parse(payload.body)).toEqual(FALLBACK_TLE)
  })

  it('serves the hardcoded fallback when there is no KV binding', async () => {
    const payload = asPayload(await produceIssTle(undefined, NOW))

    expectNoUpstreamRequest()
    expect(payload.extraHeaders?.['X-Data-Source']).toBe('fallback')
    expect(payload.extraHeaders?.['X-Error-Kind']).toBe('upstream')
  })

  it('falls back when a fresh KV entry fails schema validation', async () => {
    const kv = fakeKv({
      [KV_ISS_TLE_KEY]: envelope({ nope: true }, new Date(NOW - HOUR_MS).toISOString()),
    })

    const payload = asPayload(await produceIssTle(kv, NOW))

    expectNoUpstreamRequest()
    expect(payload.degraded).toBe(true)
    expect(payload.extraHeaders?.['X-Data-Source']).toBe('fallback')
    expect(payload.extraHeaders?.['X-Error-Kind']).toBe('upstream')
  })
})

describe('buildSatellitesBody', () => {
  it('prefers label over name and drops records with no TLE lines', () => {
    const body = buildSatellitesBody(
      [
        { label: 'Hubble', catnr: 20580, name: 'HST', line1: '1 a', line2: '2 b' },
        { label: 'Broken', catnr: 1, name: 'X' },
      ],
      '2026-09-07T00:00:00.000Z',
    )

    expect(JSON.parse(body ?? '{}')).toEqual({
      satellites: [{ name: 'Hubble', line1: '1 a', line2: '2 b' }],
      updatedAt: '2026-09-07T00:00:00.000Z',
    })
  })

  it('returns null for a non-array and for an all-invalid array', () => {
    expect(buildSatellitesBody({ nope: true }, '2026-09-07T00:00:00.000Z')).toBeNull()
    expect(buildSatellitesBody([{ label: 'X' }], '2026-09-07T00:00:00.000Z')).toBeNull()
  })
})

describe('produceSatellites', () => {
  const records = [
    { label: 'Hubble', catnr: 20580, name: 'HST', line1: '1 hubble', line2: '2 hubble' },
    { label: 'Tiangong', catnr: 48274, name: 'CSS', line1: '1 css', line2: '2 css' },
  ]

  it('serves fresh KV without touching the network', async () => {
    const fetchedAt = new Date(NOW - HOUR_MS).toISOString()
    const kv = fakeKv({ [KV_SATELLITES_KEY]: envelope(records, fetchedAt) })

    const payload = asPayload(await produceSatellites(kv, NOW))

    expectNoUpstreamRequest()
    const parsed = JSON.parse(payload.body)
    expect(parsed.satellites.map((s: { name: string }) => s.name)).toEqual(['Hubble', 'Tiangong'])
    expect(parsed.updatedAt).toBe(fetchedAt)
    expect(payload.extraHeaders?.['X-Data-Source']).toBe('kv')
  })

  it('serves stale KV, marked degraded, without asking CelesTrak', async () => {
    const fetchedAt = new Date(NOW - TEN_DAYS_MS).toISOString()
    const kv = fakeKv({ [KV_SATELLITES_KEY]: envelope(records, fetchedAt) })

    const payload = asPayload(await produceSatellites(kv, NOW))

    expectNoUpstreamRequest()
    expect(payload.degraded).toBe(true)
    expect(payload.ttl).toBe(300)
    expect(payload.extraHeaders?.['X-Data-Source']).toBe('kv-stale')
    expect(payload.extraHeaders?.['X-Error-Kind']).toBe('upstream')
    expect(payload.extraHeaders?.['X-Data-Age']).toBe(String(TEN_DAYS_MS / 1000))
    expect(JSON.parse(payload.body).satellites).toHaveLength(2)
  })

  it('serves an empty degraded list, without asking CelesTrak, when KV is missing', async () => {
    const payload = asPayload(await produceSatellites(fakeKv({}), NOW))

    expectNoUpstreamRequest()
    expect(payload.degraded).toBe(true)
    expect(payload.extraHeaders?.['X-Data-Source']).toBe('fallback')
    expect(payload.extraHeaders?.['X-Error-Kind']).toBe('upstream')
    expect(JSON.parse(payload.body)).toEqual({
      satellites: [],
      updatedAt: new Date(NOW).toISOString(),
    })
  })

  it('serves the empty fallback when there is no KV binding', async () => {
    const payload = asPayload(await produceSatellites(undefined, NOW))

    expectNoUpstreamRequest()
    expect(payload.extraHeaders?.['X-Data-Source']).toBe('fallback')
    expect(payload.extraHeaders?.['X-Error-Kind']).toBe('upstream')
  })
})
