import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { onRequest as fireball } from '../../../functions/api/fireball'
import { onRequest as planets } from '../../../functions/api/planets'
import { onRequest as sentry } from '../../../functions/api/sentry'
import { installFakeCache } from './_fakeCache'
import { fakeQueue, run } from './_fakeJplQueue'

// /api/planets, /api/sentry and /api/fireball through the jpl-queue Durable Object (#146):
// JPL takes one request at a time from any caller, so with the binding these Functions
// never fetch JPL themselves. Without it they fetch directly, as before (planets.test.ts).

const HORIZONS_RESULT = `... header ...
$$SOE
 2026-Nov-06 00:00     03 18 14.81 +17 47 39.4    1.333   4.226   34.5789 /L
 2026-Nov-07 00:00     03 21 10.66 +17 59 25.4    1.329   4.224   34.8094 /L
$$EOE
... footer ...`

const SENTRY = {
  count: '2',
  data: [
    { des: '2000 SG344', ps_cum: '-2.77' },
    { des: '29075', ps_cum: '-0.93' },
  ],
}

const FIREBALL = {
  count: '1',
  fields: ['date', 'energy', 'impact-e', 'lat', 'lat-dir', 'lon', 'lon-dir', 'alt', 'vel'],
  data: [['2026-11-01 12:00:00', '3.1', '0.12', '10.0', 'N', '20.0', 'E', '30.0', '15.0']],
}

/** Any direct fetch fails the test: with the binding, only the queue may reach JPL. */
function forbidDirectFetch() {
  const direct = vi.fn(async () => new Response('direct fetch', { status: 599 }))
  vi.stubGlobal('fetch', direct)
  return direct
}

beforeEach(() => {
  installFakeCache()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('/api/planets through the JPL queue (#146)', () => {
  it('asks Horizons for every body through the queue, never directly', async () => {
    const direct = forbidDirectFetch()
    const { ns, asked } = fakeQueue(() => ({ jplStatus: 200, body: { result: HORIZONS_RESULT } }))
    const { res } = await run(planets, '/api/planets', { JPL_QUEUE: ns })
    expect(res.status).toBe(200)
    expect(res.headers.get('X-Data-Degraded')).toBeNull()
    const body = await res.json<{ bodies: { name: string }[] }>()
    expect(body.bodies).toHaveLength(9)
    expect(asked).toHaveLength(9)
    expect(asked.every((u) => u.startsWith('https://ssd.jpl.nasa.gov/api/horizons.api?'))).toBe(
      true,
    )
    expect(ns.idFromName).toHaveBeenCalledWith('jpl')
    expect(direct).not.toHaveBeenCalled()
  })

  it('answers degraded, saying why, when the queue turns some bodies away', async () => {
    forbidDirectFetch()
    const { ns } = fakeQueue((url) =>
      new URL(url).searchParams.get('COMMAND') === '599'
        ? {
            status: 503,
            jplStatus: 0,
            body: { error: 'JPL queue is full' },
            headers: { 'X-Queue': 'full' },
          }
        : { jplStatus: 200, body: { result: HORIZONS_RESULT } },
    )
    const { res } = await run(planets, '/api/planets', { JPL_QUEUE: ns })
    expect(res.status).toBe(200)
    expect(res.headers.get('X-Data-Degraded')).toBe('1')
    expect(res.headers.get('X-Error-Kind')).toBe('upstream')
    expect(res.headers.get('X-Data-Source')).toBe('horizons')
  })

  it('stops waiting for a body the queue holds past the 20 s budget', async () => {
    vi.useFakeTimers()
    try {
      forbidDirectFetch()
      const stub = {
        fetch: vi.fn(async (_url: string, init: RequestInit) => {
          const { url } = JSON.parse(init.body as string) as { url: string }
          if (new URL(url).searchParams.get('COMMAND') === '599')
            return new Promise<never>(() => {})
          return new Response(JSON.stringify({ result: HORIZONS_RESULT }), {
            headers: { 'X-Jpl-Status': '200' },
          })
        }),
      }
      const ns = { idFromName: () => 'the-one-id', get: () => stub }
      const pending = run(planets, '/api/planets', { JPL_QUEUE: ns })
      await vi.advanceTimersByTimeAsync(20_000)
      const { res } = await pending
      expect(res.status).toBe(200)
      expect(res.headers.get('X-Data-Degraded')).toBe('1')
      const body = await res.json<{ bodies: { name: string }[] }>()
      // Jupiter used up the budget, so the four after it were never asked.
      expect(body.bodies.map((b) => b.name)).toEqual(['Sun', 'Moon', 'Mercury', 'Venus', 'Mars'])
      expect(stub.fetch).toHaveBeenCalledTimes(6)
    } finally {
      vi.useRealTimers()
    }
  })

  it('answers 503 upstream, not 502, when JPL fails every body', async () => {
    forbidDirectFetch()
    const { ns } = fakeQueue(() => ({ jplStatus: 500, body: 'oops' }))
    const { res } = await run(planets, '/api/planets', { JPL_QUEUE: ns })
    expect(res.status).toBe(503)
    expect(res.headers.get('X-Error-Kind')).toBe('upstream')
  })
})

describe('/api/sentry through the JPL queue (#146)', () => {
  it('asks Sentry through the queue and keeps the cache in front of it', async () => {
    const direct = forbidDirectFetch()
    const { ns, asked } = fakeQueue(() => ({ jplStatus: 200, body: SENTRY }))
    const first = await run(sentry, '/api/sentry', { JPL_QUEUE: ns })
    expect(first.res.status).toBe(200)
    const body = await first.res.json<{ data: { des: string }[] }>()
    expect(body.data.map((d) => d.des)).toEqual(['29075', '2000 SG344'])
    expect(asked).toEqual(['https://ssd-api.jpl.nasa.gov/sentry.api'])
    await first.settle()

    const again = await run(sentry, '/api/sentry', { JPL_QUEUE: ns })
    expect(again.res.headers.get('X-Cache')).toBe('HIT')
    expect(asked).toHaveLength(1)
    expect(direct).not.toHaveBeenCalled()
  })

  it("never proxies JPL's status, and calls a broken answer a contract failure", async () => {
    forbidDirectFetch()
    const down = fakeQueue(() => ({ jplStatus: 502, body: 'bad gateway' }))
    const res = (await run(sentry, '/api/sentry', { JPL_QUEUE: down.ns })).res
    expect(res.status).toBe(503)
    expect(res.headers.get('X-Error-Kind')).toBe('upstream')
    expect(res.headers.get('X-Upstream-Status')).toBe('502')

    installFakeCache()
    const odd = fakeQueue(() => ({ jplStatus: 200, body: { surprise: true } }))
    const bad = (await run(sentry, '/api/sentry', { JPL_QUEUE: odd.ns })).res
    expect(bad.status).toBe(500)
    expect(bad.headers.get('X-Error-Kind')).toBe('contract')
  })
})

describe('/api/fireball through the JPL queue (#146)', () => {
  it('asks Fireball through the queue, never directly', async () => {
    const direct = forbidDirectFetch()
    const { ns, asked } = fakeQueue(() => ({ jplStatus: 200, body: FIREBALL }))
    const { res } = await run(fireball, '/api/fireball', { JPL_QUEUE: ns })
    expect(res.status).toBe(200)
    const body = await res.json<{ data: { date: string; impactE: string | null }[] }>()
    expect(body.data).toEqual([
      expect.objectContaining({ date: '2026-11-01 12:00:00', impactE: '0.12' }),
    ])
    expect(asked).toEqual(['https://ssd-api.jpl.nasa.gov/fireball.api?limit=30'])
    expect(direct).not.toHaveBeenCalled()
  })

  it('answers 503 upstream when the queue is out of budget', async () => {
    forbidDirectFetch()
    const { ns } = fakeQueue(() => ({
      status: 503,
      jplStatus: 0,
      body: { error: "Today's JPL budget is spent" },
      headers: { 'X-Queue': 'budget', 'Retry-After': '3600' },
    }))
    const { res } = await run(fireball, '/api/fireball', { JPL_QUEUE: ns })
    expect(res.status).toBe(503)
    expect(res.headers.get('X-Error-Kind')).toBe('upstream')
  })
})

describe('without the binding (#146)', () => {
  it('fetches JPL directly, as before', async () => {
    const direct = vi.fn(async () => new Response(JSON.stringify(SENTRY), { status: 200 }))
    vi.stubGlobal('fetch', direct)
    const { res } = await run(sentry, '/api/sentry', {})
    expect(res.status).toBe(200)
    expect(direct).toHaveBeenCalledTimes(1)
  })
})
