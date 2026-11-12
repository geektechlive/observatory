/**
 * /api/solar-regions (#210): NOAA SWPC's numbered active regions and flare odds. The
 * fixtures are SWPC's own answers, fetched once on 2026-11-12 05:35 UTC and kept as they
 * came. The same day's Solar Region Summary (SRS 316, "Locations Valid at 11/2400Z") and
 * 3-day predictions ("Region Flare Probabilities for 2026 Nov 12") back the numbers below.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { onRequest } from '../../../functions/api/solar-regions'
import { parseProbabilities, parseRegions } from '../../../src/lib/swpcRegions'
import { installFakeCache, makeCtx } from './_fakeCache'
import PROBABILITIES from './fixtures/swpc-solar-probabilities.json'
import REGIONS from './fixtures/swpc-solar-regions.json'

describe('parseProbabilities', () => {
  it("reads the newest forecast's day-1 odds and the day they are for", () => {
    // Issued 2026 Nov 11; SWPC's text product lists Class M 45, X 5, Proton 5 for Nov 12.
    expect(parseProbabilities(PROBABILITIES)).toEqual({
      issued: '2026-11-11',
      forDate: '2026-11-12',
      c: 90,
      m: 45,
      x: 5,
      proton: 5,
    })
  })

  it('picks the newest date even when the rows arrive out of order', () => {
    const rows = [...PROBABILITIES].reverse()
    expect(parseProbabilities(rows)?.issued).toBe('2026-11-11')
  })

  it('returns null for a payload that is not the SWPC shape', () => {
    expect(parseProbabilities({ error: 'nope' })).toBeNull()
    expect(parseProbabilities([])).toBeNull()
    expect(parseProbabilities([{ date: '2026-11-11T00:00:00', c_class_1_day: 'high' }])).toBeNull()
  })
})

describe('parseRegions', () => {
  it("keeps only the newest day's regions with sunspots, numbered as SWPC numbers them", () => {
    const out = parseRegions(REGIONS)
    expect(out?.observedDate).toBe('2026-11-11')
    // SRS 316 section I: eight regions with spots. 4570 is plage only, 4571 has gone.
    expect(out?.items.map((r) => r.region)).toEqual([
      4565, 4566, 4568, 4569, 4572, 4573, 4574, 4575,
    ])
  })

  it('says when the positions are valid: the end of the observed day, UTC', () => {
    expect(parseRegions(REGIONS)?.validAt).toBe('2026-11-12T00:00:00Z')
  })

  it("carries each region's location, area, classes and its own flare odds unchanged", () => {
    const big = parseRegions(REGIONS)?.items.find((r) => r.region === 4566)
    expect(big).toEqual({
      region: 4566,
      location: 'S07W48',
      latitude: -7,
      longitude: -48,
      area: 280,
      spotClass: 'Eki',
      magClass: 'BG',
      spots: 44,
      c: 90,
      m: 40,
      x: 5,
      proton: 5,
    })
  })

  it('answers an empty list, not null, on a day with no sunspots', () => {
    const plageOnly = REGIONS.filter((r) => r.observed_date === '2026-11-11' && r.area === null)
    expect(parseRegions(plageOnly)).toEqual({
      observedDate: '2026-11-11',
      validAt: '2026-11-12T00:00:00Z',
      items: [],
    })
  })

  it('returns null for a payload that is not the SWPC shape', () => {
    expect(parseRegions({ error: 'nope' })).toBeNull()
    expect(parseRegions([])).toBeNull()
    expect(parseRegions([{ observed_date: 'yesterday', region: 'x' }])).toBeNull()
  })
})

const PROB_URL = 'https://services.swpc.noaa.gov/json/solar_probabilities.json'
const REGIONS_URL = 'https://services.swpc.noaa.gov/json/solar_regions.json'

type Answer = () => Response
const json =
  (body: unknown, status = 200): Answer =>
  () =>
    new Response(JSON.stringify(body), { status })

function serve(answers: Record<string, Answer>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      return (answers[url] ?? (() => new Response('missing', { status: 404 })))()
    }),
  )
}

type Handler = (ctx: unknown) => Promise<Response>
const call = () =>
  (onRequest as unknown as Handler)(makeCtx('https://o.test/api/solar-regions').ctx)

interface Body {
  probabilities: { issued: string; m: number } | null
  regions: { items: { region: number }[] } | null
}

describe('/api/solar-regions', () => {
  beforeEach(() => {
    installFakeCache()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('answers both halves from SWPC, not degraded', async () => {
    serve({ [PROB_URL]: json(PROBABILITIES), [REGIONS_URL]: json(REGIONS) })
    const res = await call()
    expect(res.status).toBe(200)
    expect(res.headers.get('X-Data-Degraded')).toBeNull()
    const body = await res.json<Body>()
    expect(body.probabilities?.m).toBe(45)
    expect(body.regions?.items).toHaveLength(8)
  })

  it('marks a half answer degraded, says why and where it came from', async () => {
    serve({ [PROB_URL]: json(PROBABILITIES), [REGIONS_URL]: json({}, 503) })
    const res = await call()
    expect(res.status).toBe(200)
    expect(res.headers.get('X-Data-Degraded')).toBe('1')
    expect(res.headers.get('X-Error-Kind')).toBe('upstream')
    expect(res.headers.get('X-Data-Source')).toBe('swpc')
    const body = await res.json<Body>()
    expect(body.regions).toBeNull()
    expect(body.probabilities?.issued).toBe('2026-11-11')
  })

  it('calls a reshaped feed a contract failure, not an outage', async () => {
    serve({ [PROB_URL]: json({ moved: true }), [REGIONS_URL]: json(REGIONS) })
    const res = await call()
    expect(res.headers.get('X-Data-Degraded')).toBe('1')
    expect(res.headers.get('X-Error-Kind')).toBe('contract')
  })

  it('answers 503, never 502 or the upstream status, when SWPC is down', async () => {
    serve({ [PROB_URL]: json({}, 502), [REGIONS_URL]: json({}, 504) })
    const res = await call()
    expect(res.status).toBe(503)
    expect(res.headers.get('X-Error-Kind')).toBe('upstream')
  })

  it('keeps a half answer for two minutes, not the full half hour, so it heals soon', async () => {
    serve({ [PROB_URL]: json(PROBABILITIES), [REGIONS_URL]: json({}, 503) })
    const res = await call()
    expect(res.headers.get('X-Cache-TTL')).toBe('120')
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=120')
  })

  it('keeps a full answer for the full half hour', async () => {
    serve({ [PROB_URL]: json(PROBABILITIES), [REGIONS_URL]: json(REGIONS) })
    const res = await call()
    expect(res.headers.get('X-Cache-TTL')).toBe('1800')
  })

  it('reports the status of the half that was down, not 200 from the reshaped one', async () => {
    serve({ [PROB_URL]: json({}, 503), [REGIONS_URL]: json({ moved: true }) })
    const res = await call()
    expect(res.status).toBe(503)
    expect(res.headers.get('X-Upstream-Status')).toBe('503')
  })

  it('answers 500 marked contract when both feeds changed shape', async () => {
    serve({ [PROB_URL]: json([]), [REGIONS_URL]: json({ moved: true }) })
    const res = await call()
    expect(res.status).toBe(500)
    expect(res.headers.get('X-Error-Kind')).toBe('contract')
  })
})
