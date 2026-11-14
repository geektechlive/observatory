/**
 * /api/donki failure modes (#42, #61) and sources (#65). CME, storms and SEPs come from
 * DONKI through api.nasa.gov; flares come from NOAA SWPC's 7-day list, because CCMC moved
 * DONKI (api.nasa.gov answers 404 for FLR) and CCMC itself does not answer Workers egress.
 * The handler used to answer a partial outage, or a feed whose rows all failed our schema,
 * as a clean 200 with empty arrays, which read as "a quiet week on the Sun".
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

type Feed = 'CME' | 'GST' | 'SEP' | 'NOAA'

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

/** Routes each upstream URL to a response; an unlisted feed is down. */
function route(map: Partial<Record<Feed, () => Response>>) {
  mockFetch.mockImplementation(async (url: string) => {
    if (url.includes('swpc.noaa.gov')) return (map.NOAA ?? down)()
    const kind = /DONKI\/(CME|GST|SEP)/.exec(url)?.[1] as 'CME' | 'GST' | 'SEP'
    return (map[kind] ?? down)()
  })
}

/** Every feed healthy, with overrides. */
const healthy = (over: Partial<Record<Feed, () => Response>> = {}) => {
  route({
    CME: () => ok([CME]),
    GST: () => ok([STORM]),
    SEP: () => ok([SEP]),
    NOAA: () => ok([NOAA_FLARE]),
    ...over,
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

  it('is a clean, non-degraded answer when every feed works', async () => {
    healthy()
    const out = (await call()) as Result
    expect(out.degraded).toBe(false)
    expect(out.extraHeaders?.['X-Error-Kind']).toBeUndefined()
    expect(out.extraHeaders?.['X-Data-Source']).toBeUndefined()
  })

  // #65: NOAA is the designed flare source, so it alone is not a degradation.
  it('is not degraded when flares come from NOAA and CME, storms and SEPs are healthy', async () => {
    healthy()
    const out = (await call()) as Result
    expect(out.degraded).toBe(false)
    const data = JSON.parse(out.body) as Donki
    expect(data.flares).toHaveLength(1)
    expect(data.flares[0]?.classType).toBe('C3.4')
    expect(data.flares[0]?.flrID).toBe('NOAA-2026-10-18T05:00:00Z')
  })

  // #65: api.nasa.gov answers 404 for FLR and CCMC does not answer Workers.
  it('never asks DONKI for flares', async () => {
    healthy()
    await call()
    const urls = mockFetch.mock.calls.map(([url]) => url)
    expect(urls.some((u) => u.includes('/FLR'))).toBe(false)
    expect(urls.some((u) => u.includes('ccmc.gsfc.nasa.gov'))).toBe(false)
  })

  it('asks api.nasa.gov, with the key, for CME, GST and SEP over the same week', async () => {
    healthy()
    await call()
    const urls = mockFetch.mock.calls.map(([url]) => url).filter((u) => !u.includes('noaa.gov'))
    expect(urls).toHaveLength(3)
    for (const u of urls) {
      expect(u).toMatch(
        /^https:\/\/api\.nasa\.gov\/DONKI\/(CME|GST|SEP)\?startDate=\d{4}-\d{2}-\d{2}&endDate=\d{4}-\d{2}-\d{2}&api_key=k$/,
      )
    }
  })

  it('is degraded when one DONKI feed fails', async () => {
    healthy({ SEP: down })
    const out = (await call()) as Result
    expect(out.degraded).toBe(true)
    expect(out.extraHeaders?.['X-Error-Kind']).toBe('upstream')
    expect(out.extraHeaders?.['X-Data-Source']).toBe('donki')
  })

  it('is degraded when NOAA fails, and X-Data-Source names NOAA as the failed source', async () => {
    healthy({ NOAA: down })
    const out = (await call()) as Result
    expect(out.degraded).toBe(true)
    expect(out.extraHeaders?.['X-Error-Kind']).toBe('upstream')
    expect(out.extraHeaders?.['X-Data-Source']).toBe('noaa')
    const data = JSON.parse(out.body) as Donki
    expect(data.cmes).toHaveLength(1)
    expect(data.flares).toEqual([])
  })

  it('names both failed sources when NOAA and a DONKI feed fail together', async () => {
    healthy({ NOAA: down, SEP: down })
    const out = (await call()) as Result
    expect(out.degraded).toBe(true)
    expect(out.extraHeaders?.['X-Data-Source']).toBe('donki,noaa')
  })

  it('is degraded, as a contract failure, when a feed returns rows that all fail the schema', async () => {
    healthy({ CME: () => ok([{ renamed: 'field' }]) })
    const out = (await call()) as Result
    expect(out.degraded).toBe(true)
    expect(out.extraHeaders?.['X-Error-Kind']).toBe('contract')
    expect(out.extraHeaders?.['X-Data-Source']).toBe('donki')
  })

  it('calls a non-array body a contract failure, not an outage', async () => {
    healthy({ GST: () => ok({ error: 'moved' }) })
    const out = (await call()) as Result
    expect(out.extraHeaders?.['X-Error-Kind']).toBe('contract')
  })

  it('is an upstream 503 when every feed is down', async () => {
    route({})
    const out = (await call()) as Response
    expect(out.status).toBe(503)
    expect(out.headers.get('X-Error-Kind')).toBe('upstream')
  })

  // #82: with DONKI hung, every cache miss waited the full 8 s default deadline.
  it('gives the DONKI feeds a deadline of 3 s or less', async () => {
    healthy()
    await call()
    const donkiCalls = mockFetch.mock.calls.filter(([url]) => url.includes('api.nasa.gov/DONKI/'))
    expect(donkiCalls).toHaveLength(3)
    for (const [, , opts] of donkiCalls) expect(opts?.timeoutMs).toBeLessThanOrEqual(3000)
  })

  it('passes NASA remaining quota on, from the DONKI feeds', async () => {
    mockFetch.mockImplementation(async (url: string) => {
      if (url.includes('swpc.noaa.gov')) return ok([NOAA_FLARE])
      const res = ok([])
      return new Response(res.body, { status: 200, headers: { 'X-RateLimit-Remaining': '42' } })
    })
    const out = (await call()) as Result
    expect(out.extraHeaders?.['X-Quota-Remaining']).toBe('42')
  })

  // CCMC puts speed and type inside cmeAnalyses[], not on the CME row.
  describe('CME speed and type', () => {
    const first = async (analyses: unknown) => {
      healthy({ CME: () => ok([{ ...CME, cmeAnalyses: analyses }]) })
      const out = (await call()) as Result
      return (JSON.parse(out.body) as Donki).cmes[0] as Record<string, unknown>
    }

    it('reads them from the most accurate analysis', async () => {
      const cme = await first([
        { isMostAccurate: false, speed: 100, type: 'C' },
        { isMostAccurate: true, speed: 327, type: 'S' },
        { isMostAccurate: false, speed: 900, type: 'O' },
      ])
      expect(cme).toMatchObject({ activityID: 'C1', speed: 327, type: 'S' })
      expect(cme).not.toHaveProperty('cmeAnalyses')
    })

    it('falls back to the last analysis when none is marked most accurate', async () => {
      const cme = await first([
        { isMostAccurate: false, speed: 100, type: 'C' },
        { isMostAccurate: false, speed: 450, type: 'R' },
      ])
      expect(cme).toMatchObject({ speed: 450, type: 'R' })
    })

    it('leaves speed and type empty when there is no analysis', async () => {
      const cme = await first(null)
      expect(cme.speed ?? null).toBeNull()
      expect(cme.type ?? null).toBeNull()
    })
  })
})
