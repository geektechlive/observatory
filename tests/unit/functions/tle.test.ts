import { beforeEach, describe, expect, it, vi } from 'vitest'

// The real _cache module talks to the Cloudflare Cache API, which does not exist in
// this environment. Mock it with a factory so the module is never loaded: these tests
// exercise the KV-first producers, not the cache wrapper.
vi.mock('../../../functions/api/_cache', () => ({
  cachedJson: vi.fn(),
  fetchUpstream: vi.fn(),
  upstreamError: vi.fn(),
}))

const {
  FALLBACK_TLE,
  KV_ISS_TLE_KEY,
  KV_MAX_AGE_SECONDS,
  parseTle,
  produceIssTle,
  readKvEnvelope,
} = await import('../../../functions/api/iss-tle')
const { KV_SATELLITES_KEY, buildSatellitesBody, produceSatellites } =
  await import('../../../functions/api/satellites')

const ISS_TLE_TEXT = `ISS (ZARYA)
1 25544U 98067A   26250.17589239  .00004561  00000+0  90859-4 0  9999
2 25544  51.6308 254.3052 0005020 115.4261 244.7248 15.49013499584466`

const ISS_TLE = {
  name: 'ISS (ZARYA)',
  line1: '1 25544U 98067A   26250.17589239  .00004561  00000+0  90859-4 0  9999',
  line2: '2 25544  51.6308 254.3052 0005020 115.4261 244.7248 15.49013499584466',
}

const NOW = Date.parse('2026-09-07T00:00:00.000Z')
const HOUR_MS = 3600_000

function fakeKv(entries: Record<string, string>) {
  return {
    get: (key: string) => Promise.resolve(entries[key] ?? null),
  }
}

function envelope(data: unknown, fetchedAt: string): string {
  return JSON.stringify({ fetchedAt, source: 'celestrak', data })
}

/** Stands in for _cache's fetchUpstream. */
function fakeFetch(response: { ok: boolean; text: string } | Error) {
  return vi.fn(() => {
    if (response instanceof Error) return Promise.reject(response)
    return Promise.resolve({
      ok: response.ok,
      text: () => Promise.resolve(response.text),
    } as unknown as Response)
  })
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
  expect(typeof (result as Payload)?.body).toBe('string')
  return result as Payload
}

describe('parseTle', () => {
  it('parses a CelesTrak three-line block and trims the padded name', () => {
    expect(parseTle(ISS_TLE_TEXT)).toEqual(ISS_TLE)
  })

  it('returns null when fewer than three lines are present', () => {
    expect(parseTle(`ISS (ZARYA)\n${ISS_TLE.line1}`)).toBeNull()
  })

  it('returns null when the line prefixes are wrong', () => {
    expect(parseTle(`ISS (ZARYA)\n${ISS_TLE.line2}\n${ISS_TLE.line1}`)).toBeNull()
  })

  it('returns null for an empty body', () => {
    expect(parseTle('')).toBeNull()
  })
})

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
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('serves fresh KV without touching the network', async () => {
    const fetchImpl = fakeFetch(new Error('should not be called'))
    const kv = fakeKv({
      [KV_ISS_TLE_KEY]: envelope(ISS_TLE, new Date(NOW - HOUR_MS).toISOString()),
    })

    const payload = asPayload(await produceIssTle(kv, fetchImpl, NOW))

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(JSON.parse(payload.body)).toEqual(ISS_TLE)
    expect(payload.degraded).toBeUndefined()
    expect(payload.extraHeaders?.['X-Data-Source']).toBe('kv')
    expect(payload.extraHeaders?.['X-Data-Age']).toBe('3600')
    expect(payload.ttl).toBe(3600)
  })

  it('falls forward to a live fetch when KV is missing', async () => {
    const fetchImpl = fakeFetch({ ok: true, text: ISS_TLE_TEXT })

    const payload = asPayload(await produceIssTle(fakeKv({}), fetchImpl, NOW))

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(JSON.parse(payload.body)).toEqual(ISS_TLE)
    expect(payload.extraHeaders?.['X-Data-Source']).toBe('live')
    expect(payload.degraded).toBeUndefined()
  })

  it('tries live first when KV is stale, then serves live', async () => {
    const old = { ...ISS_TLE, name: 'ISS (OLD)' }
    const kv = fakeKv({
      [KV_ISS_TLE_KEY]: envelope(old, new Date(NOW - 10 * 24 * 3600_000).toISOString()),
    })
    const fetchImpl = fakeFetch({ ok: true, text: ISS_TLE_TEXT })

    const payload = asPayload(await produceIssTle(kv, fetchImpl, NOW))

    expect(payload.extraHeaders?.['X-Data-Source']).toBe('live')
    expect(JSON.parse(payload.body).name).toBe('ISS (ZARYA)')
  })

  it('serves stale KV, marked degraded, when the live fetch fails', async () => {
    const fetchedAt = new Date(NOW - 10 * 24 * 3600_000).toISOString()
    const kv = fakeKv({ [KV_ISS_TLE_KEY]: envelope(ISS_TLE, fetchedAt) })
    const fetchImpl = fakeFetch(new Error('522'))

    const payload = asPayload(await produceIssTle(kv, fetchImpl, NOW))

    expect(payload.degraded).toBe(true)
    expect(payload.extraHeaders?.['X-Data-Source']).toBe('kv-stale')
    expect(payload.ttl).toBe(300)
    expect(JSON.parse(payload.body)).toEqual(ISS_TLE)
  })

  it('serves the hardcoded fallback when KV and the live fetch both fail', async () => {
    const fetchImpl = fakeFetch(new Error('522'))

    const payload = asPayload(await produceIssTle(undefined, fetchImpl, NOW))

    expect(payload.degraded).toBe(true)
    expect(payload.extraHeaders?.['X-Data-Source']).toBe('fallback')
    expect(JSON.parse(payload.body)).toEqual(FALLBACK_TLE)
  })

  it('treats a non-ok upstream response as a failure', async () => {
    const fetchImpl = fakeFetch({ ok: false, text: '' })

    const payload = asPayload(await produceIssTle(fakeKv({}), fetchImpl, NOW))

    expect(payload.extraHeaders?.['X-Data-Source']).toBe('fallback')
  })

  it('ignores a fresh KV entry whose payload fails schema validation', async () => {
    const kv = fakeKv({
      [KV_ISS_TLE_KEY]: envelope({ nope: true }, new Date(NOW - HOUR_MS).toISOString()),
    })
    const fetchImpl = fakeFetch({ ok: true, text: ISS_TLE_TEXT })

    const payload = asPayload(await produceIssTle(kv, fetchImpl, NOW))

    expect(payload.extraHeaders?.['X-Data-Source']).toBe('live')
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

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('serves fresh KV without touching the network', async () => {
    const fetchImpl = fakeFetch(new Error('should not be called'))
    const fetchedAt = new Date(NOW - HOUR_MS).toISOString()
    const kv = fakeKv({ [KV_SATELLITES_KEY]: envelope(records, fetchedAt) })

    const payload = asPayload(await produceSatellites(kv, fetchImpl, NOW))

    expect(fetchImpl).not.toHaveBeenCalled()
    const parsed = JSON.parse(payload.body)
    expect(parsed.satellites.map((s: { name: string }) => s.name)).toEqual(['Hubble', 'Tiangong'])
    expect(parsed.updatedAt).toBe(fetchedAt)
    expect(payload.extraHeaders?.['X-Data-Source']).toBe('kv')
  })

  it('falls forward to live CelesTrak fetches when KV is missing', async () => {
    const fetchImpl = fakeFetch({ ok: true, text: `NAME\n1 live\n2 live` })

    const payload = asPayload(await produceSatellites(fakeKv({}), fetchImpl, NOW))

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(payload.extraHeaders?.['X-Data-Source']).toBe('live')
    expect(JSON.parse(payload.body).satellites).toHaveLength(2)
  })

  it('serves stale KV, marked degraded, when the live fetch fails', async () => {
    const fetchedAt = new Date(NOW - 10 * 24 * 3600_000).toISOString()
    const kv = fakeKv({ [KV_SATELLITES_KEY]: envelope(records, fetchedAt) })
    const fetchImpl = fakeFetch(new Error('522'))

    const payload = asPayload(await produceSatellites(kv, fetchImpl, NOW))

    expect(payload.degraded).toBe(true)
    expect(payload.extraHeaders?.['X-Data-Source']).toBe('kv-stale')
    expect(JSON.parse(payload.body).satellites).toHaveLength(2)
  })

  it('serves an empty degraded list when nothing is available', async () => {
    const fetchImpl = fakeFetch(new Error('522'))

    const payload = asPayload(await produceSatellites(undefined, fetchImpl, NOW))

    expect(payload.degraded).toBe(true)
    expect(payload.extraHeaders?.['X-Data-Source']).toBe('fallback')
    expect(JSON.parse(payload.body).satellites).toEqual([])
  })
})
