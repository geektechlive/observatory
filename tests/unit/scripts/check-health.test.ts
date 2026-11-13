import { describe, expect, it, vi } from 'vitest'

import {
  CARTO_STYLE_URL,
  checkMapCredit,
  CHECKS,
  isTransient,
  judgeStale,
  main,
  MAP_CREDIT_CHECK,
  NEG_RETRY_DELAY_MS,
  retryDelayMs,
  REVALIDATE_RECHECK_MS,
  runCheck,
  runWithRetry,
  SLOW_PRODUCE_MS,
  STALE_GRACE_SECONDS,
  toReport,
  // @ts-expect-error plain ESM script, no type declarations
} from '../../../scripts/check-health.mjs'
import { parseTrajectoryParams } from '../../../src/lib/orrery/jplLookup'

/** Shape of a single check result, as runCheck produces it. */
const result = (over: Record<string, unknown> = {}) => ({
  path: '/api/eonet',
  ok: false,
  status: 503,
  ms: 8222,
  note: 'HTTP 503',
  ...over,
})

describe('isTransient', () => {
  it('treats a timeout or network failure (status 0) as transient', () => {
    expect(isTransient(result({ status: 0, note: 'timeout after 15000 ms' }))).toBe(true)
  })

  it('treats upstream 5xx as transient', () => {
    // Our own handlers normalize upstream failures to 502/503 — the exact
    // shape of the 2026-09-10 EONET blip, which recovered on its own.
    for (const status of [500, 502, 503, 504]) {
      expect(isTransient(result({ status })), `status ${String(status)}`).toBe(true)
    }
  })

  it('treats rate limiting as transient', () => {
    expect(isTransient(result({ status: 429 }))).toBe(true)
  })

  it('does NOT treat a content-contract failure as transient', () => {
    // A 200 that is missing required fields is upstream drift, not a blip.
    // Retrying it would only delay a real alert.
    expect(
      isTransient(result({ status: 200, note: 'missing currentKp and windSpeed present' })),
    ).toBe(false)
  })

  it('does NOT treat a degraded response as transient', () => {
    expect(isTransient(result({ status: 200, note: 'degraded (kv)' }))).toBe(false)
  })

  it('does NOT treat a 404 as transient', () => {
    expect(isTransient(result({ status: 404, note: 'HTTP 404' }))).toBe(false)
  })

  it('does NOT treat a 502 the handler marked as a contract failure as transient', () => {
    // A schema failure inside the handler is shape drift wearing a 5xx.
    expect(isTransient(result({ status: 502, errorKind: 'contract' }))).toBe(false)
  })

  it('never reports a passing check as transient', () => {
    expect(isTransient(result({ ok: true, status: 200, note: 'ok' }))).toBe(false)
  })
})

describe('runWithRetry', () => {
  const noDelay = () => 0

  it('returns immediately when the first attempt passes', async () => {
    const runOnce = vi.fn().mockResolvedValue(result({ ok: true, status: 200, note: 'ok' }))

    const out = await runWithRetry(runOnce, { attempts: 3, delayMs: noDelay })

    expect(runOnce).toHaveBeenCalledTimes(1)
    expect(out.ok).toBe(true)
    expect(out.attempts).toBe(1)
  })

  it('retries a transient failure and passes when the retry succeeds', async () => {
    const runOnce = vi
      .fn()
      .mockResolvedValueOnce(result({ status: 503 }))
      .mockResolvedValueOnce(result({ ok: true, status: 200, note: 'ok' }))

    const out = await runWithRetry(runOnce, { attempts: 3, delayMs: noDelay })

    expect(runOnce).toHaveBeenCalledTimes(2)
    expect(out.ok).toBe(true)
    // The recovery is recorded so a flaky endpoint stays visible in the table
    // instead of silently passing as if nothing happened.
    expect(out.attempts).toBe(2)
  })

  it('does not retry a contract failure', async () => {
    const runOnce = vi
      .fn()
      .mockResolvedValue(result({ status: 200, note: 'missing line1 and line2 present' }))

    const out = await runWithRetry(runOnce, { attempts: 3, delayMs: noDelay })

    expect(runOnce).toHaveBeenCalledTimes(1)
    expect(out.ok).toBe(false)
  })

  it('gives up after the attempt budget and reports the failure', async () => {
    const runOnce = vi.fn().mockResolvedValue(result({ status: 503 }))

    const out = await runWithRetry(runOnce, { attempts: 3, delayMs: noDelay })

    expect(runOnce).toHaveBeenCalledTimes(3)
    expect(out.ok).toBe(false)
    expect(out.attempts).toBe(3)
  })

  it('passes the failed result to the delay so a NEG replay can wait it out', async () => {
    const neg = result({ status: 502, cache: 'NEG' })
    const runOnce = vi
      .fn()
      .mockResolvedValueOnce(neg)
      .mockResolvedValueOnce(result({ ok: true, status: 200, note: 'ok' }))
    const delayMs = vi.fn(() => 0)

    await runWithRetry(runOnce, { attempts: 3, delayMs })

    expect(delayMs).toHaveBeenCalledWith(2, neg)
  })

  it('asks again after a REVALIDATING answer and judges the second one (#83)', async () => {
    // An expired entry answers 200 at once while the refresh runs behind it. Judged as
    // is, an outage would read as a pass on every run and never alert.
    const revalidating = result({ ok: true, status: 200, cache: 'REVALIDATING', note: 'ok' })
    const stale = result({ status: 200, cache: 'STALE', errorKind: 'upstream' })
    const runOnce = vi.fn().mockResolvedValueOnce(revalidating).mockResolvedValueOnce(stale)
    const delayMs = vi.fn(() => 0)

    const out = await runWithRetry(runOnce, { attempts: 3, delayMs })

    expect(runOnce).toHaveBeenCalledTimes(2)
    expect(delayMs).toHaveBeenCalledWith(2, revalidating)
    expect(out.ok).toBe(false)
    expect(out.cache).toBe('STALE')
  })

  it('asks again after a REVALIDATING answer that failed too: its body is the old one', async () => {
    // A degraded body stored by an earlier refresh says nothing about the upstream now.
    const oldDegraded = result({ status: 200, cache: 'REVALIDATING', note: 'degraded (donki)' })
    const fresh = result({ ok: true, status: 200, cache: 'HIT', note: 'ok' })
    const runOnce = vi.fn().mockResolvedValueOnce(oldDegraded).mockResolvedValueOnce(fresh)

    const out = await runWithRetry(runOnce, { attempts: 3, delayMs: noDelay })

    expect(runOnce).toHaveBeenCalledTimes(2)
    expect(out.ok).toBe(true)
  })
})

describe('retryDelayMs', () => {
  it('waits out the 60 s negative cache when the failure was a NEG replay', () => {
    // 2026-10-06: '/api/eonet 502 69ms (after 3 attempts)': all three attempts
    // replayed one cached error because the backoff (2 s, 5 s) sat inside its TTL.
    expect(NEG_RETRY_DELAY_MS).toBeGreaterThan(60_000)
    expect(retryDelayMs(2, result({ cache: 'NEG' }))).toBe(NEG_RETRY_DELAY_MS)
    expect(retryDelayMs(3, result({ cache: 'NEG' }))).toBe(NEG_RETRY_DELAY_MS)
  })

  it('gives a REVALIDATING answer time for the background refresh to land', () => {
    // fetchUpstream's deadline is 8 s, so the refresh has settled by then either way.
    expect(REVALIDATE_RECHECK_MS).toBeGreaterThan(8_000)
    expect(retryDelayMs(2, result({ ok: true, cache: 'REVALIDATING' }))).toBe(REVALIDATE_RECHECK_MS)
  })

  it('keeps the short backoff for a live failure', () => {
    expect(retryDelayMs(2, result({ cache: 'MISS' }))).toBe(2_000)
    expect(retryDelayMs(3, result({ cache: null }))).toBe(5_000)
  })
})

describe('judgeStale', () => {
  it('passes a fresh (non-STALE) response untouched', () => {
    expect(judgeStale({ cache: 'HIT', errorKind: null, dataAge: 10 })).toEqual({ ok: true })
  })

  it('passes a recent upstream-caused STALE response with a warning', () => {
    const out = judgeStale({
      cache: 'STALE',
      errorKind: 'upstream',
      dataAge: 600,
      staleStatus: '503',
    })
    expect(out.ok).toBe(true)
    expect(out.warning).toMatch(/stale/)
  })

  it('fails a STALE response older than the grace window', () => {
    const out = judgeStale({
      cache: 'STALE',
      errorKind: 'upstream',
      dataAge: (STALE_GRACE_SECONDS as number) + 1,
      staleStatus: '503',
    })
    expect(out.ok).toBe(false)
  })

  it('fails a STALE response whose age is missing rather than reading it as 0 s', () => {
    // Number(null) === 0: an absent X-Data-Age must not pass as brand-new data.
    expect(judgeStale({ cache: 'STALE', errorKind: 'upstream', dataAge: null }).ok).toBe(false)
    expect(judgeStale({ cache: 'STALE', errorKind: 'upstream', dataAge: '' }).ok).toBe(false)
  })

  it('fails a STALE response caused by a contract failure at any age', () => {
    const out = judgeStale({
      cache: 'STALE',
      errorKind: 'contract',
      dataAge: 5,
      staleStatus: '502',
    })
    expect(out.ok).toBe(false)
    expect(out.note).toMatch(/contract/)
  })
})

describe('toReport', () => {
  it('emits one signature per endpoint with pass/fail and the table detail', () => {
    const out = toReport([
      { path: '/api/eonet', ok: false, status: 502, ms: 69, note: 'HTTP 502', attempts: 3 },
      { path: '/api/neo', ok: true, status: 200, ms: 300, note: 'MISS', attempts: 1 },
    ])
    expect(out).toEqual([
      { signature: 'health:/api/eonet', ok: false, detail: expect.stringContaining('HTTP 502') },
      { signature: 'health:/api/neo', ok: true, detail: expect.any(String) },
    ])
  })

  it('flags a pass that rode on a STALE fallback as a warning, not a recovery', () => {
    const [entry] = toReport([
      {
        path: '/api/eonet',
        ok: true,
        status: 200,
        ms: 40,
        note: 'STALE / stale 600s (upstream: HTTP 503)',
        warning: 'stale 600s (upstream: HTTP 503)',
        attempts: 1,
      },
    ])
    expect(entry).toMatchObject({ ok: true, warning: true })
  })

  // #71: only upstream-caused failures wait for the 4-run threshold.
  it('marks a failure upstream-caused only when the handler said so and the body was not at fault', () => {
    const out = toReport([
      result({ errorKind: 'upstream' }),
      result({ status: 200, errorKind: 'upstream', note: 'degraded (noaa-flares)' }),
      result({ status: 200, errorKind: 'contract', note: 'degraded (donki)' }),
      result({ status: 500, errorKind: 'contract' }),
      result({ status: 0, note: 'timeout after 15000 ms' }),
      result({ status: 200, errorKind: 'upstream', reason: 'contract', note: 'missing title' }),
      result({ status: 404 }),
    ])
    expect(out.map((e: { upstream?: boolean }) => e.upstream === true)).toEqual([
      true,
      true,
      false,
      false,
      false,
      false,
      false,
    ])
  })

  it('never marks a pass upstream-caused', () => {
    const [entry] = toReport([result({ ok: true, status: 200, errorKind: 'upstream' })])
    expect(entry).not.toHaveProperty('upstream')
  })
})

describe('runCheck (#71)', () => {
  const spec = {
    path: '/api/apod',
    requires: 'title',
    check: (b: { title?: unknown }) => typeof b.title === 'string',
  }
  const respond = (body: unknown, headers: Record<string, string> = {}, status = 200) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers }))

  it('calls a body missing its fields a contract failure, whatever the headers say', async () => {
    vi.stubGlobal(
      'fetch',
      respond({}, { 'X-Error-Kind': 'upstream', 'X-Cache': 'STALE', 'X-Data-Age': '60' }),
    )
    const r = await runCheck('https://o.test', spec)
    vi.unstubAllGlobals()
    expect(r).toMatchObject({ ok: false, reason: 'contract' })
    expect(toReport([r])[0]).not.toHaveProperty('upstream')
  })

  it('warns, without failing, when the refresh behind the answer was slow (#86)', async () => {
    vi.stubGlobal('fetch', respond({ title: 'x' }, { 'X-Cache': 'HIT', 'X-Produce-Ms': '8200' }))
    const r = await runCheck('https://o.test', spec)
    vi.unstubAllGlobals()
    expect(r).toMatchObject({ ok: true, warning: 'slow upstream: 8200ms' })
    expect(r.note).toContain('slow upstream: 8200ms')
    expect(toReport([r])[0]).toMatchObject({ ok: true, warning: true })
  })

  it('only warns about a "not set up" 503 on a probe that allows it (#100)', async () => {
    const notSetUp = () =>
      respond(
        { error: 'On-demand JPL lookup is not set up yet' },
        { 'X-Error-Kind': 'upstream', 'X-Not-Configured': 'jpl-queue' },
        503,
      )
    vi.stubGlobal('fetch', notSetUp())
    const allowed = await runCheck('https://o.test', { ...spec, notConfiguredWarns: true })
    expect(allowed).toMatchObject({ ok: true, warning: 'not set up (jpl-queue)' })
    vi.stubGlobal('fetch', notSetUp())
    const strict = await runCheck('https://o.test', spec)
    vi.unstubAllGlobals()
    expect(strict).toMatchObject({ ok: false })
  })

  it('does not warn at or under the slow threshold, or without a recorded time', async () => {
    const cases: Record<string, string>[] = [
      { 'X-Cache': 'MISS', 'X-Produce-Ms': String(SLOW_PRODUCE_MS) },
      { 'X-Cache': 'MISS' },
    ]
    for (const headers of cases) {
      vi.stubGlobal('fetch', respond({ title: 'x' }, headers))
      const r = await runCheck('https://o.test', spec)
      vi.unstubAllGlobals()
      expect(r).toMatchObject({ ok: true })
      expect(r.warning).toBeUndefined()
    }
  })

  it('carries the handler error kind on a degraded answer', async () => {
    vi.stubGlobal(
      'fetch',
      respond(
        { title: 'x' },
        { 'X-Data-Degraded': '1', 'X-Data-Source': 'noaa-flares', 'X-Error-Kind': 'upstream' },
      ),
    )
    const r = await runCheck('https://o.test', spec)
    vi.unstubAllGlobals()
    expect(r).toMatchObject({ ok: false, note: 'degraded (noaa-flares)' })
    expect(toReport([r])[0]).toMatchObject({ upstream: true })
  })
})

describe('probed endpoints (#42, #61)', () => {
  type Check = { path: string; check: (body: unknown) => boolean }
  const byPath = (path: string) => (CHECKS as Check[]).find((c) => c.path === path)

  it('probes APOD: a title and a picture or video URL', () => {
    const apod = byPath('/api/apod')
    expect(apod).toBeDefined()
    expect(apod?.check({ title: 'Pillars', url: 'https://apod.nasa.gov/x.jpg' })).toBe(true)
    expect(apod?.check({ title: 'Pillars', url: null })).toBe(false)
    expect(apod?.check({})).toBe(false)
  })

  it('probes DONKI: all four event arrays present', () => {
    const donki = byPath('/api/donki')
    expect(donki).toBeDefined()
    expect(donki?.check({ flares: [], cmes: [], geomagneticStorms: [], seps: [] })).toBe(true)
    expect(donki?.check({ flares: [] })).toBe(false)
  })

  it('probes orrery close approaches: a non-empty list, each with its CAD row (#92)', () => {
    const neo = byPath('/api/orrery-neo')
    expect(neo).toBeDefined()
    const approach = { closeApproach: { distAu: 0.01 }, fine: null }
    expect(neo?.check({ approaches: [approach] })).toBe(true)
    expect(neo?.check({ approaches: [] })).toBe(false)
    expect(neo?.check({ approaches: [{ fine: null }] })).toBe(false)
  })

  it('probes orrery small bodies: the interstellar objects, each with its elements (#99)', () => {
    const sb = byPath('/api/orrery-smallbodies')
    expect(sb).toBeDefined()
    const visitor = { elements: { e: 6.12 }, fine: null, coarse: null }
    expect(sb?.check({ comets: [], interstellar: [visitor] })).toBe(true)
    expect(sb?.check({ comets: [], interstellar: [] })).toBe(false)
    expect(sb?.check({ interstellar: [visitor] })).toBe(false)
    expect(sb?.check({ comets: [], interstellar: [{ fine: null }] })).toBe(false)
  })

  it('probes the KV-built JPL feeds: planets, Sentry and fireball each carry their list (#146)', () => {
    const planets = byPath('/api/planets')
    const sentry = byPath('/api/sentry')
    const fireball = byPath('/api/fireball')
    expect(planets?.check({ bodies: [{ name: 'Sun' }] })).toBe(true)
    expect(planets?.check({ bodies: [] })).toBe(false)
    expect(sentry?.check({ data: [{ des: '1' }] })).toBe(true)
    expect(sentry?.check({ data: [] })).toBe(false)
    expect(fireball?.check({ data: [{ date: 'd' }] })).toBe(true)
    expect(fireball?.check({ data: [] })).toBe(false)
  })

  it('probes orrery dwarf planets: a non-empty list, each with its span (#99 item 8)', () => {
    const d = byPath('/api/orrery-dwarfs')
    expect(d).toBeDefined()
    const pluto = { coarse: { start: 1, step: 1826, samples: [1, 2, 3] } }
    expect(d?.check({ dwarfs: [pluto] })).toBe(true)
    expect(d?.check({ dwarfs: [] })).toBe(false)
    expect(d?.check({ dwarfs: [{ coarse: null }] })).toBe(false)
  })

  it("probes tonight's comets: a non-empty list, each with a magnitude law and a span (#135)", () => {
    const c = byPath('/api/comets-tonight')
    expect(c).toBeDefined()
    const span = { start: 1, step: 1, samples: [1, 2, 3, 4, 5, 6] }
    const borisov = { m1: 13.8, k1: 4.5, fine: span, coarse: null }
    expect(c?.check({ comets: [borisov] })).toBe(true)
    expect(c?.check({ comets: [{ ...borisov, fine: null, coarse: span }] })).toBe(true)
    expect(c?.check({ comets: [] })).toBe(false)
    expect(c?.check({ comets: [{ ...borisov, fine: null }] })).toBe(false)
    expect(c?.check({ comets: [{ ...borisov, m1: null }] })).toBe(false)
  })

  it('probes on-demand lookup with a fixed past span, so it is cached, not a JPL call (#100)', () => {
    const traj = (CHECKS as (Check & { notConfiguredWarns?: boolean })[]).find((c) =>
      c.path.startsWith('/api/trajectory?'),
    )
    expect(traj).toBeDefined()
    expect(traj?.path).toBe(
      '/api/trajectory?id=sb:20000433&start=2025-01-07&end=2027-01-07&step=2d',
    )
    // A span the endpoint takes (#223): only the orrery's own spans are.
    const query = new URL(`https://x${traj?.path ?? ''}`).searchParams
    expect(parseTrajectoryParams(query).ok).toBe(true)
    expect(traj?.notConfiguredWarns).toBe(true)
    const object = { name: '433 Eros (A898 PA)' }
    expect(traj?.check({ object, fine: { samples: Array(2196).fill(0.1) } })).toBe(true)
    expect(traj?.check({ object, fine: { samples: Array(18).fill(0.1) } })).toBe(false)
    expect(traj?.check({ object, fine: null })).toBe(false)
    expect(traj?.check({ object, fine: { samples: [] } })).toBe(false)
  })

  it('probes Space-Track: a TIP list, each re-entry with its time (#101)', () => {
    const st = byPath('/api/spacetrack?part=catalog')
    expect(st).toBeDefined()
    const reentry = { noradId: '45700', decayEpoch: '2026-11-11T20:32:00Z' }
    expect(st?.check({ tip: { reentries: [reentry] } })).toBe(true)
    expect(st?.check({ tip: { reentries: [] } })).toBe(true)
    expect(st?.check({ tip: null })).toBe(false)
    expect(st?.check({ tip: { reentries: [{ noradId: '1' }] } })).toBe(false)
  })

  it('probes the re-entry elements: none is fine, each row must propagate now (#154)', () => {
    const st = byPath('/api/spacetrack?part=catalog')
    const now = Date.now()
    const epoch = new Date(now - 3_600_000).toISOString().slice(0, 19)
    const row = (over: Record<number, unknown> = {}) =>
      Object.assign(
        ['STARLINK-4598', '53630', '2021-001A', epoch, 16, 0.0002, 53, 1, 2, 3, 0.1, 0, 0],
        over,
      )
    const reentry = { noradId: '53630', decayEpoch: '2026-11-11T20:32:00Z' }
    const body = (elements?: unknown) => ({ tip: { reentries: [reentry], elements } })
    expect(st?.check(body())).toBe(true)
    expect(st?.check(body([]))).toBe(true)
    expect(st?.check(body([row()]))).toBe(true)
    // Not a mean motion SGP4 can use, an eccentricity of 1, an epoch past the 3-day window.
    expect(st?.check(body([row({ 4: 0 })]))).toBe(false)
    expect(st?.check(body([row({ 5: 1.2 })]))).toBe(false)
    expect(st?.check(body([row({ 3: '2026-01-01T00:00:00' })]))).toBe(false)
    expect(st?.check(body([row({ 4: null })]))).toBe(false)
    expect(st?.check(body('rows'))).toBe(false)
  })

  it('probes DISCOS: the craft, each with a name (#101)', () => {
    const d = byPath('/api/discos')
    expect(d).toBeDefined()
    expect(d?.check({ craft: { '-31': { name: 'Voyager 1' } } })).toBe(true)
    expect(d?.check({ craft: {} })).toBe(false)
    expect(d?.check({})).toBe(false)
  })

  it('probes orrery satellites through the small stations group, rows of 13 fields (#98)', () => {
    const sats = byPath('/api/orrery-sats?group=stations')
    expect(sats).toBeDefined()
    const iss = ['ISS (ZARYA)', '25544', '1998-067A', '2026-11-06T11:57:30.503808']
    const row = [...iss, 15.49, 0.0006, 51.63, 6.9, 314.9, 45.1, 0.0001, 0.00005, 0]
    expect(sats?.check({ fields: Array(13).fill('f'), rows: [row] })).toBe(true)
    expect(sats?.check({ rows: [] })).toBe(false)
    expect(sats?.check({ rows: [['ISS (ZARYA)']] })).toBe(false)
  })
})

describe("CARTO's map credit (#221)", () => {
  // Trimmed from the live dark-matter-nolabels style.json (2026-11-12), as in
  // tests/e2e/mapCredit.ts: the credit is the source's `attribution`.
  const LIVE_ATTRIBUTION =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/about-carto/">CARTO</a>'
  const style = (attribution?: string) => ({
    version: 8,
    sources: {
      protomaps: { type: 'vector', ...(attribution === undefined ? {} : { attribution }) },
    },
    layers: [],
  })
  const fakeFetch = (body: unknown, status = 200) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status }))

  it('asks for the style the map loads, once', async () => {
    const fetch = fakeFetch(style(LIVE_ATTRIBUTION))
    await checkMapCredit(fetch)
    expect(CARTO_STYLE_URL).toBe(
      'https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json',
    )
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(CARTO_STYLE_URL, expect.anything())
  })

  it('passes when the attribution credits CARTO and OpenStreetMap', async () => {
    const r = await checkMapCredit(fakeFetch(style(LIVE_ATTRIBUTION)))
    expect(r).toMatchObject({ path: MAP_CREDIT_CHECK, ok: true, status: 200 })
    expect(toReport([r])[0]).toEqual({
      signature: `health:${MAP_CREDIT_CHECK as string}`,
      ok: true,
      detail: expect.stringContaining('PASS') as unknown,
    })
  })

  it('opens a drift incident on the first run when a credit is missing', async () => {
    const r = await checkMapCredit(fakeFetch(style('&copy; CARTO')))
    expect(r).toMatchObject({ ok: false, status: 200, reason: 'contract' })
    expect(r.note).toContain('OpenStreetMap')
    const [entry] = toReport([r])
    expect(entry).toMatchObject({ ok: false })
    expect(entry).not.toHaveProperty('upstream')
  })

  it('calls a style with no attribution at all drift', async () => {
    const r = await checkMapCredit(fakeFetch(style()))
    expect(r).toMatchObject({ ok: false, reason: 'contract' })
    expect(toReport([r])[0]).not.toHaveProperty('upstream')
  })

  it('holds a fetch failure as upstream: CARTO down is not drift (#71)', async () => {
    const down = vi.fn(async () => Promise.reject(new TypeError('fetch failed')))
    const r = await checkMapCredit(down)
    expect(r).toMatchObject({ ok: false, status: 0, errorKind: 'upstream' })
    expect(toReport([r])[0]).toMatchObject({ ok: false, upstream: true })
  })

  it('holds an HTTP error from CARTO as upstream, without retrying', async () => {
    const fetch = fakeFetch({ error: 'x' }, 503)
    const r = await checkMapCredit(fetch)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(r).toMatchObject({ ok: false, status: 503, errorKind: 'upstream' })
    expect(toReport([r])[0]).toMatchObject({ upstream: true })
  })

  it('holds an unreadable (non-JSON) body as upstream, not drift', async () => {
    const html = vi.fn(async () =>
      Promise.resolve(new Response('<html>busy</html>', { status: 200 })),
    )
    const r = await checkMapCredit(html)
    expect(r).toMatchObject({ ok: false, errorKind: 'upstream' })
    expect(toReport([r])[0]).toMatchObject({ upstream: true })
  })

  it('is reported alongside the endpoints by main', async () => {
    const written: string[] = []
    await main({
      runAll: () => Promise.resolve([]),
      checkCredit: () => checkMapCredit(fakeFetch(style('&copy; CARTO'))),
      writeReport: (text: string) => {
        written.push(text)
        return Promise.resolve()
      },
      log: () => undefined,
      error: () => undefined,
    })
    expect(JSON.parse(written[0] ?? '[]')).toEqual([
      expect.objectContaining({ signature: `health:${MAP_CREDIT_CHECK as string}`, ok: false }),
    ])
  })
})

describe('exit code (#120)', () => {
  // The incident reporter (issue + Discord) is the alert. A red job only made GitHub
  // email about outages nobody could fix, every 6 h.
  const passingCredit = () =>
    Promise.resolve({ path: 'map-credit', ok: true, status: 200, ms: 1, note: 'ok' })
  const quiet = { log: () => undefined, error: () => undefined, checkCredit: passingCredit }

  it('exits 0 once a failing endpoint is written to the incident report', async () => {
    const written: string[] = []
    const failing = result({ path: '/api/donki', status: 200, note: 'degraded (noaa-flares)' })
    const code = await main({
      runAll: () => Promise.resolve([failing]),
      writeReport: (text: string) => {
        written.push(text)
        return Promise.resolve()
      },
      ...quiet,
    })
    expect(code).toBe(0)
    expect(JSON.parse(written[0] ?? '[]')).toContainEqual(
      expect.objectContaining({ signature: 'health:/api/donki', ok: false }),
    )
  })

  it('fails when the report cannot be written: then nothing would alert', async () => {
    const run = main({
      runAll: () => Promise.resolve([result()]),
      writeReport: () => Promise.reject(new Error('EACCES')),
      ...quiet,
    })
    await expect(run).rejects.toThrow('EACCES')
  })
})
