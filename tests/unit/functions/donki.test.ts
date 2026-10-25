/**
 * /api/donki failure modes (#42, #61). NASA DONKI has been 503 since 2026-10-11, and the
 * handler used to answer a partial outage, or a feed whose rows all failed our schema,
 * as a clean 200 with empty arrays, which read as "a quiet week on the Sun".
 * Flares fall back to NOAA SWPC's 7-day list when DONKI's flare feed fails.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type * as CacheModule from '../../../functions/api/_cache'
import { fetchUpstream } from '../../../functions/api/_cache'
import { onRequest } from '../../../functions/api/donki'

vi.mock('../../../functions/api/_cache', async (importActual) => ({
  ...(await importActual<typeof CacheModule>()),
  cachedJson: vi.fn(
    async (_ctx: unknown, _key: string, _ttl: number, produce: () => Promise<unknown>) => produce(),
  ),
  fetchUpstream: vi.fn(),
}))

const mockFetch = vi.mocked(fetchUpstream)

interface Result {
  body: string
  degraded?: boolean
  extraHeaders?: Record<string, string>
}
interface Donki {
  flares: { flrID: string; classType?: string | null }[]
  cmes: unknown[]
  geomagneticStorms: unknown[]
  seps: unknown[]
}

const FLARE = { flrID: 'F1', beginTime: '2026-10-18T01:00Z', classType: 'M1.2' }
const CME = { activityID: 'C1', startTime: '2026-10-18T02:00Z' }
const STORM = { gstID: 'G1', startTime: '2026-10-18T03:00Z' }
const SEP = { sepID: 'S1', eventTime: '2026-10-18T04:00Z' }
const NOAA_FLARE = {
  begin_time: '2026-10-18T05:00:00Z',
  max_time: '2026-10-18T05:10:00Z',
  end_time: '2026-10-18T05:20:00Z',
  max_class: 'C3.4',
}

const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
const down = () => new Response('down', { status: 503 })

/** Routes each upstream URL to a response. */
function route(map: Partial<Record<'FLR' | 'CME' | 'GST' | 'SEP' | 'NOAA', () => Response>>) {
  mockFetch.mockImplementation(async (url: string) => {
    if (url.includes('swpc.noaa.gov')) return (map.NOAA ?? down)()
    const kind = /DONKI\/(FLR|CME|GST|SEP)/.exec(url)?.[1] as 'FLR' | 'CME' | 'GST' | 'SEP'
    return (map[kind] ?? down)()
  })
}

const call = async (): Promise<Result | Response> =>
  (onRequest as unknown as (ctx: unknown) => Promise<Result | Response>)({
    request: { url: 'https://observatory.test/api/donki' },
    env: { NASA_API_KEY: 'k' },
    waitUntil: () => undefined,
  })

describe('/api/donki', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('is a clean, non-degraded answer when every DONKI feed works', async () => {
    route({
      FLR: () => ok([FLARE]),
      CME: () => ok([CME]),
      GST: () => ok([STORM]),
      SEP: () => ok([SEP]),
    })
    const out = (await call()) as Result
    expect(out.degraded).not.toBe(true)
    const data = JSON.parse(out.body) as Donki
    expect(data.flares.map((f) => f.flrID)).toEqual(['F1'])
  })

  it('is degraded when one DONKI feed fails', async () => {
    route({ FLR: () => ok([FLARE]), CME: () => ok([CME]), GST: () => ok([STORM]) })
    const out = (await call()) as Result
    expect(out.degraded).toBe(true)
  })

  it('is degraded when a feed returns rows that all fail the schema (drift)', async () => {
    route({
      FLR: () => ok([FLARE]),
      CME: () => ok([{ renamed: 'field' }]),
      GST: () => ok([STORM]),
      SEP: () => ok([SEP]),
    })
    const out = (await call()) as Result
    expect(out.degraded).toBe(true)
  })

  it('falls back to NOAA flares, degraded, when DONKI is down', async () => {
    route({ NOAA: () => ok([NOAA_FLARE]) })
    const out = (await call()) as Result
    expect(out.degraded).toBe(true)
    const data = JSON.parse(out.body) as Donki
    expect(data.flares).toHaveLength(1)
    expect(data.flares[0]?.classType).toBe('C3.4')
    expect(data.cmes).toEqual([])
  })

  it('is an upstream 503 when DONKI and NOAA are both down', async () => {
    route({})
    const out = (await call()) as Response
    expect(out.status).toBe(503)
    expect(out.headers.get('X-Error-Kind')).toBe('upstream')
  })

  // #71: the health check counts only upstream-caused trouble toward its 4-run threshold;
  // drift must still alert on the first run, so a degraded answer has to say which it is.
  it('says a degraded answer is upstream-caused, and served by NOAA, when DONKI is down', async () => {
    route({ NOAA: () => ok([NOAA_FLARE]) })
    const out = (await call()) as Result
    expect(out.extraHeaders?.['X-Error-Kind']).toBe('upstream')
    expect(out.extraHeaders?.['X-Data-Source']).toBe('noaa-flares')
  })

  it('says a degraded answer is a contract failure when a feed drifted', async () => {
    route({
      FLR: () => ok([FLARE]),
      CME: () => ok([{ renamed: 'field' }]),
      GST: () => ok([STORM]),
      SEP: () => ok([SEP]),
    })
    const out = (await call()) as Result
    expect(out.extraHeaders?.['X-Error-Kind']).toBe('contract')
    expect(out.extraHeaders?.['X-Data-Source']).toBe('donki')
  })

  it('calls a non-array body a contract failure, not an outage', async () => {
    route({
      FLR: () => ok({ error: 'moved' }),
      CME: () => ok([CME]),
      GST: () => ok([STORM]),
      SEP: () => ok([SEP]),
      NOAA: () => ok([NOAA_FLARE]),
    })
    const out = (await call()) as Result
    expect(out.extraHeaders?.['X-Error-Kind']).toBe('contract')
  })

  it('sends no error kind on a clean answer', async () => {
    route({
      FLR: () => ok([FLARE]),
      CME: () => ok([CME]),
      GST: () => ok([STORM]),
      SEP: () => ok([SEP]),
    })
    const out = (await call()) as Result
    expect(out.extraHeaders?.['X-Error-Kind']).toBeUndefined()
  })
})
