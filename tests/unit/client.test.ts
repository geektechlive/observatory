import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z, ZodError } from 'zod'

vi.mock('@/lib/api/quota', () => ({ trackQuota: vi.fn() }))

import { getJson, getJsonMeta, HttpError } from '@/lib/api/client'
import { trackQuota } from '@/lib/api/quota'

const Schema = z.object({ ok: z.boolean() })

interface FakeResponseInit {
  ok?: boolean
  status?: number
  headers?: Record<string, string>
  json?: unknown
}

/** Minimal Response stand-in: only `ok`, `status`, `headers.get` and `json()` are used. */
function fakeResponse(init: FakeResponseInit): Response {
  const headers = new Map<string, string>(
    Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
  )
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null },
    json: () => Promise.resolve(init.json),
  } as unknown as Response
}

function mockFetch(init: FakeResponseInit): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(fakeResponse(init))),
  )
}

beforeEach(() => {
  vi.mocked(trackQuota).mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getJson', () => {
  it('returns parsed data on a 200', async () => {
    mockFetch({ json: { ok: true } })
    await expect(getJson('/api/test', Schema)).resolves.toEqual({ ok: true })
  })

  it('throws HttpError carrying the status when the response is not ok', async () => {
    mockFetch({ ok: false, status: 503 })
    const err: unknown = await getJson('/api/test', Schema).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(HttpError)
    expect((err as HttpError).status).toBe(503)
    expect((err as HttpError).message).toContain('/api/test')
  })

  it('throws ZodError when the payload does not match the schema', async () => {
    mockFetch({ json: { ok: 'yes' } })
    const err: unknown = await getJson('/api/test', Schema).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ZodError)
  })

  it('does not call trackQuota when X-Quota-Remaining is absent', async () => {
    mockFetch({ json: { ok: true } })
    await getJson('/api/test', Schema)
    expect(trackQuota).not.toHaveBeenCalled()
  })

  it('calls trackQuota when X-Quota-Remaining is present', async () => {
    mockFetch({ json: { ok: true }, headers: { 'X-Quota-Remaining': '42' } })
    await getJson('/api/test', Schema)
    expect(trackQuota).toHaveBeenCalledTimes(1)
  })

  it('does not track quota on a failed response', async () => {
    mockFetch({ ok: false, status: 500, headers: { 'X-Quota-Remaining': '42' } })
    await getJson('/api/test', Schema).catch(() => undefined)
    expect(trackQuota).not.toHaveBeenCalled()
  })
})

describe('getJsonMeta', () => {
  it('defaults to not degraded with unknown age when headers are absent', async () => {
    mockFetch({ json: { ok: true } })
    await expect(getJsonMeta('/api/test', Schema)).resolves.toEqual({
      data: { ok: true },
      degraded: false,
      dataAgeSeconds: null,
    })
  })

  it('reads X-Data-Degraded and X-Data-Age', async () => {
    mockFetch({
      json: { ok: true },
      headers: { 'X-Data-Degraded': '1', 'X-Data-Age': '900' },
    })
    const result = await getJsonMeta('/api/test', Schema)
    expect(result.degraded).toBe(true)
    expect(result.dataAgeSeconds).toBe(900)
  })

  it('treats any X-Data-Degraded value other than 1 as healthy', async () => {
    mockFetch({ json: { ok: true }, headers: { 'X-Data-Degraded': '0' } })
    const result = await getJsonMeta('/api/test', Schema)
    expect(result.degraded).toBe(false)
  })

  it('falls back to null for an unparseable age header', async () => {
    mockFetch({ json: { ok: true }, headers: { 'X-Data-Age': 'soon' } })
    const result = await getJsonMeta('/api/test', Schema)
    expect(result.dataAgeSeconds).toBeNull()
  })

  it('forwards the init argument to fetch', async () => {
    mockFetch({ json: { ok: true } })
    const init: RequestInit = { headers: { Accept: 'application/json' } }
    await getJsonMeta('/api/test', Schema, init)
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/test', init)
  })
})

describe('HttpError', () => {
  it('is a real Error with a stable name', () => {
    const err = new HttpError(404, 'nope')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('HttpError')
    expect(err.status).toBe(404)
  })
})
