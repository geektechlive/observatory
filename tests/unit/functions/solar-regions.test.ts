/**
 * /api/solar-regions (#210): NOAA SWPC's numbered active regions and flare odds. The
 * fixtures are SWPC's own answers, fetched once on 2026-11-12 05:35 UTC and kept as they
 * came. The same day's Solar Region Summary (SRS 316, "Locations Valid at 11/2400Z") and
 * 3-day predictions ("Region Flare Probabilities for 2026 Nov 12") back the numbers below.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { onRequest } from '../../../functions/api/solar-regions'
import { regionOnDisc } from '../../../src/lib/sunDisc'
import { parseProbabilities, parseRegions } from '../../../src/lib/swpcRegions'
import { installFakeCache, makeCtx } from './_fakeCache'
import PROBABILITIES from './fixtures/swpc-solar-probabilities.json'
import REGIONS from './fixtures/swpc-solar-regions.json'
import EARLY from './fixtures/swpc-solar-regions-early.json'

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
      preliminary: false,
      items: [],
    })
  })

  it('returns null for a payload that is not the SWPC shape', () => {
    expect(parseRegions({ error: 'nope' })).toBeNull()
    expect(parseRegions([])).toBeNull()
    expect(parseRegions([{ observed_date: 'yesterday', region: 'x' }])).toBeNull()
  })
})

/**
 * #213: SWPC's file at 06:14 UTC on 2026-11-12, kept byte for byte (unformatted, so it is in
 * .prettierignore). Its newest rows, observed_date 2026-11-12, are early reports: SWPC's own
 * sunspot_report.json at the same time held one observation for the day, Learmonth's at
 * 01:50 UTC, which saw 4566 at S08W48 and which SWPC carried to S08W61 for 12/2400Z. The
 * spot and magnetic classes are null and every region's flare odds are 0 until the region
 * summary is compiled at 00:30 the next day.
 */
describe('parseRegions on an early-day file (#213)', () => {
  const early = parseRegions(EARLY)

  it('keeps every region with spots even before SWPC issues its class', () => {
    expect(early?.observedDate).toBe('2026-11-12')
    // Nine rows for 12 Nov. 4570 has no spots and no area (plage only in SRS 316 IA): dropped.
    expect(early?.items.map((r) => r.region)).toEqual([
      4565, 4566, 4568, 4569, 4572, 4573, 4574, 4575,
    ])
  })

  it('says the positions are valid at the end of the observed day, as on a complete day', () => {
    expect(early?.validAt).toBe('2026-11-13T00:00:00Z')
  })

  it('puts 4566 where Learmonth saw it at 01:50 when turned back from that valid time', () => {
    const big = early?.items.find((r) => r.region === 4566)
    expect(big).toBeDefined()
    if (!big || !early) return
    const p = regionOnDisc(big, early.validAt, new Date('2026-11-12T01:50:00Z'))
    // Learmonth's own report: S08W48. x = cos(lat) sin(W), so W = asin(x / cos(lat)).
    const westDeg =
      (Math.asin((p?.x ?? 0) / Math.cos((big.latitude * Math.PI) / 180)) * 180) / Math.PI
    expect(westDeg).toBeGreaterThan(47)
    expect(westDeg).toBeLessThan(49)
  })

  it('marks the day early, leaves the class unissued and drops the placeholder zero odds', () => {
    expect(early?.preliminary).toBe(true)
    const big = early?.items.find((r) => r.region === 4566)
    expect(big).toEqual({
      region: 4566,
      location: 'S08W61',
      latitude: -8,
      longitude: -61,
      area: 300,
      spotClass: null,
      magClass: null,
      spots: 23,
      c: null,
      m: null,
      x: null,
      proton: null,
    })
    // 4565 and 4569 keep yesterday's classes, but their odds are SWPC's zeros too.
    expect(early?.items.every((r) => r.m === null)).toBe(true)
  })

  it('calls a complete day complete and keeps its odds', () => {
    const done = parseRegions(REGIONS)
    expect(done?.preliminary).toBe(false)
    expect(done?.items.find((r) => r.region === 4566)?.m).toBe(40)
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
