/**
 * APOD across UTC midnight (#61). The cache key used to include the UTC date, so at
 * midnight the key changed and stale-if-error had nothing to fall back to: a NASA
 * outage after midnight became a hard error. This runs the real cachedJson.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { onRequest } from '../../../functions/api/apod'
import { installFakeCache, makeCtx } from './_fakeCache'

const APOD = {
  date: '2026-10-18',
  title: 'The Pillars, Again',
  explanation: 'Columns of gas and dust.',
  url: 'https://apod.nasa.gov/apod/image/2610/pillars.jpg',
  media_type: 'image',
  service_version: 'v1',
}

type Handler = (ctx: unknown) => Promise<Response>
const call = (tc: ReturnType<typeof makeCtx>) =>
  (onRequest as unknown as Handler)({ ...tc.ctx, env: { NASA_API_KEY: 'k' } })

describe('/api/apod across UTC midnight', () => {
  beforeEach(() => {
    installFakeCache()
    vi.useFakeTimers({ toFake: ['Date'] })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("serves yesterday's picture as STALE when NASA fails after midnight", async () => {
    vi.setSystemTime(new Date('2026-10-18T12:00:00Z'))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(APOD), { status: 200 })),
    )
    const day1 = makeCtx('https://observatory.test/api/apod')
    const first = await call(day1)
    await day1.settle()
    expect(first.status).toBe(200)

    vi.setSystemTime(new Date('2026-10-19T00:30:00Z'))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('down', { status: 500 })),
    )
    const day2 = makeCtx('https://observatory.test/api/apod')
    const res = await call(day2)
    expect(res.status).toBe(200)
    expect(res.headers.get('X-Cache')).toBe('STALE')
    expect((await res.json<{ title: string }>()).title).toBe(APOD.title)
  })

  it('serves a fresh picture after midnight when NASA is up', async () => {
    vi.setSystemTime(new Date('2026-10-18T12:00:00Z'))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(APOD), { status: 200 })),
    )
    const day1 = makeCtx('https://observatory.test/api/apod')
    await call(day1)
    await day1.settle()

    vi.setSystemTime(new Date('2026-10-19T00:30:00Z'))
    const next = { ...APOD, date: '2026-10-19', title: 'A New Day' }
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(next), { status: 200 })),
    )
    const day2 = makeCtx('https://observatory.test/api/apod')
    const res = await call(day2)
    expect(res.headers.get('X-Cache')).toBe('MISS')
    expect((await res.json<{ title: string }>()).title).toBe('A New Day')
  })

  it('answers our JSON 503, not a 502, when NASA fails with nothing cached', async () => {
    vi.setSystemTime(new Date('2026-10-19T00:30:00Z'))
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('down', { status: 500 })),
    )
    const res = await call(makeCtx('https://observatory.test/api/apod'))
    expect(res.status).toBe(503)
    expect(res.headers.get('X-Error-Kind')).toBe('upstream')
    expect(res.headers.get('X-Upstream-Status')).toBe('500')
  })
})
