/**
 * /api/aftershocks (#76): USGS's official aftershock forecasts (the `oaf` product) for
 * the strongest quakes of the last 30 days. Fixtures are trimmed from real USGS
 * answers on 2026-10-27; the M7.7 near Panama had a 39% chance of an M5+ that week.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { onRequest } from '../../../functions/api/aftershocks'
import { installFakeCache, makeCtx } from './_fakeCache'
import DETAIL from './fixtures/oaf-detail.json'
import FORECAST from './fixtures/oaf-forecast.json'
import SEARCH from './fixtures/oaf-search.json'
const PANAMA = SEARCH.features[0]
const FORECAST_URL = DETAIL.properties.products.oaf[0]?.contents['forecast.json'].url ?? ''

type Routes = Record<string, () => Response>
const json =
  (body: unknown, status = 200) =>
  () =>
    new Response(JSON.stringify(body), { status })

/** Answers the search, then each detail and forecast URL from `routes`; anything else 404s. */
function serve(routes: Routes, search: () => Response = json(SEARCH)) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      if (url.includes('producttype=oaf')) return search()
      return (routes[url] ?? (() => new Response('missing', { status: 404 })))()
    }),
  )
}

type Handler = (ctx: unknown) => Promise<Response>
const call = () => (onRequest as unknown as Handler)(makeCtx('https://o.test/api/aftershocks').ctx)

interface Body {
  forecasts: {
    id: string
    mag: number
    place: string
    time: number
    url: string
    day: { m5: number; m6: number }
    week: { m5: number; m6: number }
  }[]
}

describe('/api/aftershocks', () => {
  beforeEach(() => {
    installFakeCache()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("reads USGS's day and week odds of an M5+ and M6+ aftershock", async () => {
    serve({ [PANAMA?.properties.detail ?? '']: json(DETAIL), [FORECAST_URL]: json(FORECAST) })
    const res = await call()
    expect(res.status).toBe(200)
    const { forecasts } = await res.json<Body>()
    expect(forecasts[0]).toMatchObject({
      id: 'us6000u18k',
      mag: 7.7,
      url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us6000u18k',
      day: { m5: 0.0801, m6: 0.008 },
      week: { m5: 0.3919, m6: 0.0479 },
    })
  })

  it('asks USGS for the strongest quakes of the last 30 days, not the latest', async () => {
    serve({})
    await call()
    const url = vi.mocked(fetch).mock.calls[0]?.[0] as string
    expect(url).toContain('producttype=oaf')
    expect(url).toContain('orderby=magnitude')
    expect(url).toMatch(/starttime=\d{4}-\d{2}-\d{2}/)
  })

  it('skips a quake whose forecast is missing, and answers the rest degraded', async () => {
    serve({ [PANAMA?.properties.detail ?? '']: json(DETAIL), [FORECAST_URL]: json(FORECAST) })
    const res = await call()
    const { forecasts } = await res.json<Body>()
    expect(forecasts.map((f) => f.id)).toEqual(['us6000u18k'])
    expect(res.headers.get('X-Data-Degraded')).toBe('1')
    expect(res.headers.get('X-Error-Kind')).toBe('upstream')
  })

  it('answers an empty list, not an error, when no quake has a forecast', async () => {
    serve({}, json({ type: 'FeatureCollection', features: [] }))
    const res = await call()
    expect(res.status).toBe(200)
    expect((await res.json<Body>()).forecasts).toEqual([])
    expect(res.headers.get('X-Data-Degraded')).toBeNull()
  })

  it('calls a forecast without the day/week M5 and M6 bins a contract failure', async () => {
    const broken = { forecast: [{ label: '1 Day', bins: [] }] }
    serve({ [PANAMA?.properties.detail ?? '']: json(DETAIL), [FORECAST_URL]: json(broken) })
    const res = await call()
    expect(res.headers.get('X-Error-Kind')).toBe('contract')
  })

  it('is an upstream error when the USGS search fails', async () => {
    serve({}, () => new Response('down', { status: 503 }))
    const res = await call()
    expect(res.status).toBe(503)
    expect(res.headers.get('X-Error-Kind')).toBe('upstream')
  })
})
