import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mock the Cache API module so it is never loaded; these tests drive the KV-first
// producer directly. The error builders mirror the real ones closely enough to
// assert status and X-Error-Kind.
vi.mock('../../../functions/api/_cache', () => ({
  cachedJson: vi.fn(),
  fetchUpstream: vi.fn(),
  upstreamError: vi.fn(
    (status: number, message: string) =>
      new Response(JSON.stringify({ error: message }), {
        status: status === 0 || status >= 520 ? 503 : 502,
        headers: { 'X-Error-Kind': 'upstream' },
      }),
  ),
  contractError: vi.fn(
    (message: string) =>
      new Response(JSON.stringify({ error: message }), {
        status: 502,
        headers: { 'X-Error-Kind': 'contract' },
      }),
  ),
}))

const { KV_LAUNCHES_KEY, KV_FRESH_SECONDS, produceLaunches } =
  await import('../../../functions/api/launches')

const NOW = Date.parse('2026-10-09T18:00:00.000Z')
const HOUR_MS = 3_600_000

const PAYLOAD = {
  valid_auth: false,
  count: 1,
  result: [{ id: 1, name: 'Starlink Group 10-1', sort_date: '1791600000' }],
}

function fakeKv(entries: Record<string, string>) {
  return { get: (key: string) => Promise.resolve(entries[key] ?? null) }
}

function kvWith(hoursOld: number, data: unknown = PAYLOAD) {
  const fetchedAt = new Date(NOW - hoursOld * HOUR_MS).toISOString()
  return fakeKv({
    [KV_LAUNCHES_KEY]: JSON.stringify({ fetchedAt, source: 'rocketlaunch.live', data }),
  })
}

const liveOk = () =>
  vi.fn(async () => new Response(JSON.stringify({ ...PAYLOAD, count: 2 }), { status: 200 }))
const liveStatus = (status: number) => vi.fn(async () => new Response('', { status }))

type Result = { body: string; degraded?: boolean; extraHeaders?: Record<string, string> }

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('produceLaunches (KV-first, #30)', () => {
  it('serves a fresh KV copy without calling RocketLaunch.live', async () => {
    const fetchImpl = liveOk()
    const out = (await produceLaunches(kvWith(6), fetchImpl, NOW)) as Result

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(JSON.parse(out.body)).toEqual(PAYLOAD)
    expect(out.degraded).toBeFalsy()
    expect(out.extraHeaders).toMatchObject({ 'X-Data-Source': 'kv', 'X-Data-Age': '21600' })
  })

  it('treats the refresh cadence plus slack as fresh', () => {
    // The refresh writes every 6 h; two missed runs must still read as fresh.
    expect(KV_FRESH_SECONDS).toBeGreaterThanOrEqual(12 * 3600)
  })

  it('goes live when the KV copy is older than the fresh window', async () => {
    const fetchImpl = liveOk()
    const out = (await produceLaunches(kvWith(13), fetchImpl, NOW)) as Result

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(JSON.parse(out.body).count).toBe(2)
    expect(out.extraHeaders).toMatchObject({ 'X-Data-Source': 'live' })
  })

  it('goes live when the fresh KV copy fails the schema', async () => {
    const fetchImpl = liveOk()
    const out = (await produceLaunches(kvWith(1, { nope: true }), fetchImpl, NOW)) as Result
    expect(out.extraHeaders).toMatchObject({ 'X-Data-Source': 'live' })
  })

  it('falls back to the old KV copy, degraded, when live fails, and logs why', async () => {
    const out = (await produceLaunches(kvWith(30), liveStatus(403), NOW)) as Result

    expect(JSON.parse(out.body)).toEqual(PAYLOAD)
    expect(out.degraded).toBe(true)
    expect(out.extraHeaders).toMatchObject({ 'X-Data-Source': 'kv-backup', 'X-Data-Age': '108000' })
    // The failure mode was invisible before #30: the reason must reach the logs.
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('403'))
  })

  it('logs a thrown live fetch too', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('Upstream fetch failed: connection refused')
    })
    const out = (await produceLaunches(kvWith(30), fetchImpl, NOW)) as Result
    expect(out.degraded).toBe(true)
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('connection refused'))
  })

  it('is an upstream error with no KV copy and live unavailable', async () => {
    const out = await produceLaunches(fakeKv({}), liveStatus(500), NOW)
    expect(out).toBeInstanceOf(Response)
    expect((out as Response).headers.get('X-Error-Kind')).toBe('upstream')
  })

  it('is a contract error with no KV copy and a live payload that breaks the schema', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"error":"busy"}', { status: 200 }))
    const out = await produceLaunches(undefined, fetchImpl, NOW)
    expect((out as Response).status).toBe(502)
    expect((out as Response).headers.get('X-Error-Kind')).toBe('contract')
  })

  it('is a contract error when live returns a non-JSON body', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>busy</html>', { status: 200 }))
    const out = await produceLaunches(undefined, fetchImpl, NOW)
    expect((out as Response).headers.get('X-Error-Kind')).toBe('contract')
  })
})
