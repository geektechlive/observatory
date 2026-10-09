import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  cachedJson,
  contractError,
  fetchUpstream,
  UpstreamError,
  upstreamError,
} from '../../../functions/api/_cache'

interface Entry {
  text: string
  status: number
  headers: [string, string][]
}

function installFakeCache(): Map<string, Entry> {
  const store = new Map<string, Entry>()
  const fake = {
    match: async (req: Request): Promise<Response | undefined> => {
      const e = store.get(req.url)
      return e
        ? new Response(e.text, { status: e.status, headers: new Headers(e.headers) })
        : undefined
    },
    put: async (req: Request, res: Response): Promise<void> => {
      store.set(req.url, { text: await res.text(), status: res.status, headers: [...res.headers] })
    },
  }
  vi.stubGlobal('caches', { default: fake })
  return store
}

interface TestCtx {
  ctx: { request: { url: string }; waitUntil: (p: Promise<unknown>) => void }
  settle: () => Promise<void>
}

function makeCtx(): TestCtx {
  const pending: Promise<unknown>[] = []
  return {
    ctx: {
      request: { url: 'https://example.test/api/x' },
      waitUntil: (p) => {
        pending.push(p)
      },
    },
    settle: async () => {
      await Promise.all(pending)
    },
  }
}

describe('cachedJson', () => {
  beforeEach(() => {
    installFakeCache()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('returns MISS on the first call and HIT on the second without re-running the producer', async () => {
    const { ctx, settle } = makeCtx()
    const produce = vi.fn(async () => ({ body: '{"a":1}' }))

    const miss = await cachedJson(ctx, 'k', 100, produce)
    await settle()
    expect(miss.headers.get('X-Cache')).toBe('MISS')
    expect(miss.headers.get('X-Data-Age')).toBe('0')
    expect(await miss.text()).toBe('{"a":1}')

    const hit = await cachedJson(ctx, 'k', 100, produce)
    expect(hit.headers.get('X-Cache')).toBe('HIT')
    expect(await hit.text()).toBe('{"a":1}')
    expect(produce).toHaveBeenCalledTimes(1)
  })

  it('preserves extraHeaders and a producer ttl override', async () => {
    const { ctx, settle } = makeCtx()
    const res = await cachedJson(ctx, 'k', 100, async () => ({
      body: '{}',
      ttl: 42,
      extraHeaders: { 'X-Quota-Remaining': '7' },
    }))
    await settle()
    expect(res.headers.get('X-Cache-TTL')).toBe('42')
    expect(res.headers.get('X-Quota-Remaining')).toBe('7')
  })

  it('caches a degraded body for the full ttl and replays X-Data-Degraded on MISS and HIT', async () => {
    const { ctx, settle } = makeCtx()
    const produce = async () => ({ body: '{"d":1}', degraded: true })

    const miss = await cachedJson(ctx, 'k', 100, produce)
    await settle()
    expect(miss.headers.get('X-Data-Degraded')).toBe('1')
    expect(miss.headers.get('X-Cache-TTL')).toBe('100')

    const hit = await cachedJson(ctx, 'k', 100, produce)
    expect(hit.headers.get('X-Cache')).toBe('HIT')
    expect(hit.headers.get('X-Data-Degraded')).toBe('1')
  })

  it('negative-caches a non-ok producer Response and replays it as NEG', async () => {
    const { ctx, settle } = makeCtx()
    const produce = vi.fn(
      async () => new Response('{"error":"Upstream NASA API error"}', { status: 500 }),
    )

    const first = await cachedJson(ctx, 'k', 100, produce)
    await settle()
    expect(first.status).toBe(502) // normalized, never the raw 500
    expect(first.headers.get('X-Cache')).toBe('NEG')
    expect(await first.text()).toBe('{"error":"Upstream NASA API error"}')

    const second = await cachedJson(ctx, 'k', 100, produce)
    expect(second.status).toBe(502)
    expect(second.headers.get('X-Cache')).toBe('NEG')
    expect(produce).toHaveBeenCalledTimes(1)
  })

  it('normalizes a 5xx edge status to 503 in the negative entry', async () => {
    const { ctx, settle } = makeCtx()
    const res = await cachedJson(
      ctx,
      'k',
      100,
      async () => new Response('{"error":"x"}', { status: 522 }),
    )
    await settle()
    expect(res.status).toBe(503)
  })

  it('turns a thrown producer into a 503 NEG and logs the real error', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { ctx, settle } = makeCtx()
    const produce = vi.fn(async () => {
      throw new UpstreamError('boom')
    })

    const first = await cachedJson(ctx, 'k', 100, produce)
    await settle()
    expect(first.status).toBe(503)
    expect(first.headers.get('X-Cache')).toBe('NEG')
    expect(await first.text()).toBe('{"error":"Upstream unavailable"}')
    expect(warn).toHaveBeenCalled()

    const second = await cachedJson(ctx, 'k', 100, produce)
    expect(second.status).toBe(503)
    expect(second.headers.get('X-Cache')).toBe('NEG')
    expect(produce).toHaveBeenCalledTimes(1)
  })

  it('passes an ok producer Response through uncached', async () => {
    const { ctx, settle } = makeCtx()
    const produce = vi.fn(
      async () =>
        new Response('{"stale":true}', {
          headers: { 'Content-Type': 'application/json', 'X-Cache': 'STALE' },
        }),
    )

    const first = await cachedJson(ctx, 'k', 100, produce)
    await settle()
    expect(first.status).toBe(200)
    expect(first.headers.get('X-Cache')).toBe('STALE')

    await cachedJson(ctx, 'k', 100, produce)
    expect(produce).toHaveBeenCalledTimes(2) // nothing was cached
  })

  it('does not let a negative entry shadow a good entry under the same key', async () => {
    const store = installFakeCache()
    const { ctx, settle } = makeCtx()

    // Produce a negative entry at `k:neg`.
    await cachedJson(ctx, 'k', 100, async () => new Response('{"error":"x"}', { status: 500 }))
    await settle()
    expect(store.has('https://example.test/__cache/k%3Aneg')).toBe(true)

    // A good entry lands at the positive key (e.g. written by another colo request).
    store.set('https://example.test/__cache/k', {
      text: '{"ok":1}',
      status: 200,
      headers: [
        ['content-type', 'application/json'],
        ['x-cache-ttl', '100'],
        ['x-cached-at', String(Date.now())],
      ],
    })

    const res = await cachedJson(ctx, 'k', 100, async () => ({ body: '{"fresh":1}' }))
    expect(res.status).toBe(200)
    expect(res.headers.get('X-Cache')).toBe('HIT')
    expect(await res.text()).toBe('{"ok":1}')
  })

  it('shrinks the replayed max-age as the entry ages', async () => {
    const t0 = 1_700_000_000_000
    const now = vi.spyOn(Date, 'now').mockReturnValue(t0)
    const { ctx, settle } = makeCtx()

    await cachedJson(ctx, 'k', 100, async () => ({ body: '{}' }))
    await settle()

    now.mockReturnValue(t0 + 30_000)
    const hit = await cachedJson(ctx, 'k', 100, async () => ({ body: '{}' }))
    expect(hit.headers.get('Cache-Control')).toBe('public, max-age=70')
    expect(hit.headers.get('X-Data-Age')).toBe('30')

    now.mockReturnValue(t0 + 100_000)
    const edge = await cachedJson(ctx, 'k', 100, async () => ({ body: '{}' }))
    expect(edge.headers.get('Cache-Control')).toBe('public, max-age=0')
  })
})

describe('cachedJson stale-if-error', () => {
  const t0 = 1_700_000_000_000
  const failing = async (): Promise<Response> => upstreamError(500, 'EONET upstream error')

  beforeEach(() => {
    installFakeCache()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  async function seed({ ctx, settle }: TestCtx): Promise<void> {
    await cachedJson(ctx, 'k', 100, async () => ({ body: '{"good":1}' }))
    await settle()
  }

  it('keeps the positive entry past its ttl so it can serve as a stale fallback', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(t0)
    const store = installFakeCache()
    await seed(makeCtx())
    const stored = store.get('https://example.test/__cache/k')
    expect(stored?.headers).toContainEqual([
      'cache-control',
      `public, max-age=${String(100 + 86_400)}`,
    ])
  })

  it('refetches once the entry is older than its ttl', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(t0)
    const tc = makeCtx()
    await seed(tc)

    now.mockReturnValue(t0 + 101_000)
    const produce = vi.fn(async () => ({ body: '{"fresh":1}' }))
    const res = await cachedJson(tc.ctx, 'k', 100, produce)
    expect(res.headers.get('X-Cache')).toBe('MISS')
    expect(await res.text()).toBe('{"fresh":1}')
    expect(produce).toHaveBeenCalledTimes(1)
  })

  it('serves the last good body as STALE when the producer fails past ttl', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(t0)
    const tc = makeCtx()
    await seed(tc)

    now.mockReturnValue(t0 + 400_000)
    const res = await cachedJson(tc.ctx, 'k', 100, failing)
    await tc.settle()
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('{"good":1}')
    expect(res.headers.get('X-Cache')).toBe('STALE')
    expect(res.headers.get('X-Data-Age')).toBe('400')
    expect(res.headers.get('X-Stale-Status')).toBe('502')
    expect(res.headers.get('X-Error-Kind')).toBe('upstream')
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=60')
  })

  it('serves stale on a thrown producer too', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const now = vi.spyOn(Date, 'now').mockReturnValue(t0)
    const tc = makeCtx()
    await seed(tc)

    now.mockReturnValue(t0 + 200_000)
    const res = await cachedJson(tc.ctx, 'k', 100, async () => {
      throw new UpstreamError('boom')
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('X-Cache')).toBe('STALE')
    expect(res.headers.get('X-Stale-Status')).toBe('503')
  })

  it('serves stale instead of a neg hit, without re-running the producer', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(t0)
    const tc = makeCtx()
    await seed(tc)

    now.mockReturnValue(t0 + 200_000)
    const produce = vi.fn(failing)
    await cachedJson(tc.ctx, 'k', 100, produce)
    await tc.settle()
    const second = await cachedJson(tc.ctx, 'k', 100, produce)
    expect(second.status).toBe(200)
    expect(second.headers.get('X-Cache')).toBe('STALE')
    expect(second.headers.get('X-Error-Kind')).toBe('upstream')
    expect(produce).toHaveBeenCalledTimes(1)
  })

  it('marks a stale fallback caused by a contract failure as contract', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(t0)
    const tc = makeCtx()
    await seed(tc)

    now.mockReturnValue(t0 + 200_000)
    const res = await cachedJson(tc.ctx, 'k', 100, async () =>
      contractError('Invalid EONET response'),
    )
    expect(res.headers.get('X-Cache')).toBe('STALE')
    expect(res.headers.get('X-Error-Kind')).toBe('contract')
  })

  it('treats an unparseable upstream body (thrown SyntaxError) as a contract failure', async () => {
    // ~20 handlers call upstream.json() unguarded: an HTML 200 throws a SyntaxError.
    // That is shape drift and must not be laundered into a retried/STALE upstream blip.
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const now = vi.spyOn(Date, 'now').mockReturnValue(t0)
    const tc = makeCtx()
    await seed(tc)

    now.mockReturnValue(t0 + 200_000)
    const res = await cachedJson(tc.ctx, 'k', 100, async () => {
      JSON.parse('<html>maintenance</html>')
      return { body: '{}' }
    })
    expect(res.headers.get('X-Cache')).toBe('STALE')
    expect(res.headers.get('X-Error-Kind')).toBe('contract')
    expect(res.headers.get('X-Stale-Status')).toBe('502')
  })

  it('can opt out of stale-if-error, for inner raw-feed caches', async () => {
    // _swpc.ts and geomag.ts nest a raw-feed cache inside a handler's cache. A STALE
    // raw body there would be parsed and re-cached by the outer layer as a fresh MISS.
    const now = vi.spyOn(Date, 'now').mockReturnValue(t0)
    const tc = makeCtx()
    await cachedJson(tc.ctx, 'k', 100, async () => ({ body: '{"good":1}' }), {
      staleIfError: false,
    })
    await tc.settle()

    now.mockReturnValue(t0 + 200_000)
    const res = await cachedJson(tc.ctx, 'k', 100, failing, { staleIfError: false })
    expect(res.status).toBe(502)
    expect(res.headers.get('X-Cache')).toBe('NEG')
  })

  it('replays the error kind on a neg hit when there is no stale body', async () => {
    const tc = makeCtx()
    await cachedJson(tc.ctx, 'k', 100, async () => contractError('Invalid EONET response'))
    await tc.settle()
    const res = await cachedJson(tc.ctx, 'k', 100, async () => ({ body: '{}' }))
    expect(res.status).toBe(502)
    expect(res.headers.get('X-Cache')).toBe('NEG')
    expect(res.headers.get('X-Error-Kind')).toBe('contract')
  })
})

describe('contractError', () => {
  it('is a 502 marked as a contract failure, with our own message', async () => {
    const res = contractError('Invalid EONET response')
    expect(res.status).toBe(502)
    expect(res.headers.get('X-Error-Kind')).toBe('contract')
    expect(await res.json()).toEqual({ error: 'Invalid EONET response' })
  })

  it('marks upstreamError as an upstream failure', () => {
    expect(upstreamError(500, 'x').headers.get('X-Error-Kind')).toBe('upstream')
  })
})

describe('upstreamError', () => {
  it('maps 0 and >= 520 to 503 and everything else to 502, with our own message only', async () => {
    expect(upstreamError(0, 'nope').status).toBe(503)
    expect(upstreamError(520, 'nope').status).toBe(503)
    expect(upstreamError(500, 'nope').status).toBe(502)
    expect(upstreamError(429, 'nope').status).toBe(502)
    const res = upstreamError(500, 'Upstream unavailable')
    expect(await res.json()).toEqual({ error: 'Upstream unavailable' })
  })
})

describe('fetchUpstream', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('throws UpstreamError with status 503 when the request exceeds the timeout', async () => {
    vi.stubGlobal(
      'fetch',
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new Error('The operation was aborted'))
          })
        }),
    )
    await expect(
      fetchUpstream('https://example.test/x', undefined, { timeoutMs: 10 }),
    ).rejects.toBeInstanceOf(UpstreamError)
  })

  it('returns the upstream response when it resolves in time', async () => {
    vi.stubGlobal('fetch', async () => new Response('ok', { status: 200 }))
    const res = await fetchUpstream('https://example.test/x', undefined, { timeoutMs: 1000 })
    expect(res.status).toBe(200)
  })

  it('aborts via a caller-supplied signal merged with the deadline', async () => {
    vi.stubGlobal(
      'fetch',
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new Error('aborted by caller'))
          })
        }),
    )
    const controller = new AbortController()
    const pending = fetchUpstream(
      'https://example.test/x',
      { signal: controller.signal },
      {
        timeoutMs: 5000,
      },
    )
    controller.abort()
    await expect(pending).rejects.toBeInstanceOf(UpstreamError)
  })
})
