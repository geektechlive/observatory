import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { NOT_CONFIGURED_HEADER } from '../../../functions/api/_jpl'
import { onRequest as lookup } from '../../../functions/api/lookup'
import { onRequest as trajectory } from '../../../functions/api/trajectory'
import { SOURCES } from '../../../src/lib/health'
import { readLookupResponse, TrajectoryResponseSchema } from '../../../src/schemas/jplLookup'
import erosVectors from '../fixtures/jpl-lookup/horizons-eros.json'
import apophis from '../fixtures/jpl-lookup/sbdb-apophis.json'
import halley from '../fixtures/jpl-lookup/sbdb-halley.json'
import none from '../fixtures/jpl-lookup/sbdb-none.json'
import eros from '../fixtures/jpl-lookup/sbdb-spk433.json'
import { installFakeCache } from './_fakeCache'

// /api/lookup and /api/trajectory (#100) with the real cachedJson over a fake Cache API
// and a fake jpl-queue Durable Object that answers from real JPL fixtures.

interface Reply {
  status?: number
  jplStatus: number
  body: unknown
  headers?: Record<string, string>
}

function fakeQueue(replies: (url: string) => Reply) {
  const asked: string[] = []
  const stub = {
    fetch: vi.fn(async (_url: string, init: RequestInit) => {
      const { url } = JSON.parse(init.body as string) as { url: string }
      asked.push(url)
      const r = replies(url)
      return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), {
        status: r.status ?? 200,
        headers: { 'X-Jpl-Status': String(r.jplStatus), ...r.headers },
      })
    }),
  }
  const ns = {
    idFromName: vi.fn(() => 'the-one-id'),
    get: vi.fn(() => stub),
  }
  return { ns, asked }
}

function run(
  handler: typeof lookup,
  path: string,
  env: Record<string, unknown>,
): Promise<{ res: Response; settle: () => Promise<void> }> {
  const pending: Promise<unknown>[] = []
  const ctx = {
    request: new Request(`https://observatory.test${path}`),
    env,
    waitUntil: (p: Promise<unknown>) => pending.push(p),
  }
  return Promise.resolve(handler(ctx as unknown as Parameters<typeof lookup>[0])).then((res) => ({
    res,
    settle: async () => {
      await Promise.all(pending)
    },
  }))
}

beforeEach(() => {
  installFakeCache()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('/api/lookup (#100)', () => {
  it('answers an object from SBDB, through the queue, and caches it', async () => {
    const { ns, asked } = fakeQueue(() => ({ jplStatus: 200, body: apophis }))
    const first = await run(lookup, '/api/lookup?q=%20Apophis%20', { JPL_QUEUE: ns })
    expect(first.res.status).toBe(200)
    const body = readLookupResponse(await first.res.json())
    expect(body?.query).toBe('Apophis')
    expect(body?.result.type === 'object' && body.result.object.spkid).toBe('20099942')
    expect(asked).toEqual(['https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=Apophis'])
    expect(ns.idFromName).toHaveBeenCalledWith('jpl')
    await first.settle()

    // The same search, spaced differently, is the same cache entry: JPL is not asked again.
    const again = await run(lookup, '/api/lookup?q=Apophis', { JPL_QUEUE: ns })
    expect(again.res.headers.get('X-Cache')).toBe('HIT')
    expect(asked).toHaveLength(1)
  })

  it("reads SBDB's list (HTTP 300) and not-found answers", async () => {
    const list = fakeQueue(() => ({ jplStatus: 300, body: halley }))
    const l = await run(lookup, '/api/lookup?q=halley', { JPL_QUEUE: list.ns })
    expect(readLookupResponse(await l.res.json())?.result).toMatchObject({
      type: 'list',
      count: 2,
    })
    const missing = fakeQueue(() => ({ jplStatus: 200, body: none }))
    const m = await run(lookup, '/api/lookup?q=zzzzqqq', { JPL_QUEUE: missing.ns })
    expect(readLookupResponse(await m.res.json())?.result).toEqual({ type: 'none' })
  })

  it('refuses a bad query with 400 before asking anyone', async () => {
    const { ns, asked } = fakeQueue(() => ({ jplStatus: 200, body: apophis }))
    const { res } = await run(lookup, '/api/lookup?q=%3Cscript%3E', { JPL_QUEUE: ns })
    expect(res.status).toBe(400)
    expect(asked).toHaveLength(0)
  })

  it('says lookup is not set up when the binding is missing', async () => {
    const { res } = await run(lookup, '/api/lookup?q=eros', {})
    expect(res.status).toBe(503)
    expect(res.headers.get('X-Error-Kind')).toBe('upstream')
    expect(res.headers.get(NOT_CONFIGURED_HEADER)).toBe('jpl-queue')
  })

  it('answers 503 upstream when the queue is full or JPL is down', async () => {
    const busy = fakeQueue(() => ({
      status: 503,
      jplStatus: 0,
      body: { error: 'JPL queue is full' },
      headers: { 'X-Queue': 'full', 'Retry-After': '8' },
    }))
    const b = await run(lookup, '/api/lookup?q=eros', { JPL_QUEUE: busy.ns })
    expect(b.res.status).toBe(503)
    expect(b.res.headers.get('X-Error-Kind')).toBe('upstream')

    const down = fakeQueue(() => ({ jplStatus: 500, body: 'oops' }))
    const d = await run(lookup, '/api/lookup?q=ceres', { JPL_QUEUE: down.ns })
    expect(d.res.status).toBe(503)
    expect(d.res.headers.get('X-Upstream-Status')).toBe('500')
  })

  it('calls an unreadable SBDB answer a contract failure', async () => {
    const odd = fakeQueue(() => ({ jplStatus: 200, body: { surprise: true } }))
    const { res } = await run(lookup, '/api/lookup?q=eros', { JPL_QUEUE: odd.ns })
    expect(res.status).toBe(500)
    expect(res.headers.get('X-Error-Kind')).toBe('contract')
  })
})

// The orrery's 2-day span around 2026-11-01 (`lookupSpan`): /api/trajectory takes only
// the spans the orrery asks for (#223).
const GRID_PATH = '/api/trajectory?id=sb:20000433&start=2025-09-04&end=2027-09-04&step=2d'
const GRID_START_JD = 2460922.5
const GRID_SAMPLES = 366

/** The Eros fixture's answer stretched to `n` rows, `stepDays` apart, from `startJd`. */
function erosRows(n: number, startJd = GRID_START_JD, stepDays = 2) {
  const [head = '', rest = ''] = erosVectors.result.split('$$SOE\n')
  const [rows = '', tail = ''] = rest.split('$$EOE')
  const first = rows.split('\n')[0] ?? ''
  const cells = first.split(',').slice(1).join(',')
  const lines = Array.from(
    { length: n },
    (_, i) => `${(startJd + i * stepDays).toFixed(9)},${cells}`,
  )
  return { ...erosVectors, result: `${head}$$SOE\n${lines.join('\n')}\n$$EOE${tail}` }
}

describe('/api/trajectory (#100)', () => {
  const path = GRID_PATH
  const gridVectors = erosRows(GRID_SAMPLES)

  it('refuses a span the orrery never asks for with 400, before asking JPL (#223)', async () => {
    const { ns, asked } = queueFor()
    for (const off of [
      '/api/trajectory?id=sb:20000433&start=2026-11-01&end=2026-11-03&step=1d',
      '/api/trajectory?id=sb:20000433&start=2025-09-05&end=2027-09-05&step=2d',
      '/api/trajectory?id=sb:20000433&start=2026-11-11&end=2026-11-15&step=10m',
      '/api/trajectory?id=sb:020000433&start=2025-09-04&end=2027-09-04&step=2d',
    ]) {
      const { res } = await run(trajectory, off, { JPL_QUEUE: ns })
      expect(res.status, off).toBe(400)
    }
    expect(asked).toHaveLength(0)
  })

  it('takes a close pass’s dense span (#215)', async () => {
    const dense = '/api/trajectory?id=sb:20000433&start=2026-11-10&end=2026-11-14&step=10m'
    const { ns } = queueFor(erosRows(577, 2461354.5, 10 / 1440))
    const { res } = await run(trajectory, dense, { JPL_QUEUE: ns })
    expect(res.status).toBe(200)
    expect(TrajectoryResponseSchema.parse(await res.json()).fine?.samples).toHaveLength(577 * 6)
  })

  function queueFor(vectors: unknown = gridVectors) {
    return fakeQueue((url) =>
      url.includes('sbdb.api') ? { jplStatus: 200, body: eros } : { jplStatus: 200, body: vectors },
    )
  }

  it('answers sampled vectors with provenance, after checking the target name', async () => {
    const { ns, asked } = queueFor()
    const { res } = await run(trajectory, path, { JPL_QUEUE: ns })
    expect(res.status).toBe(200)
    const body = TrajectoryResponseSchema.parse(await res.json())
    expect(body.object.name).toBe('433 Eros (A898 PA)')
    expect(body.target).toBe('433 Eros (A898 PA)')
    expect(body.fine?.start).toBe(GRID_START_JD)
    expect(body.fine?.step).toBe(2)
    expect(body.fine?.samples).toHaveLength(GRID_SAMPLES * 6)
    expect(body.fine?.samples[0]).toBeCloseTo(0.2863368944893412, 12)
    expect(asked[0]).toBe('https://ssd-api.jpl.nasa.gov/sbdb.api?spk=20000433')
    expect(new URL(asked[1] ?? '').searchParams.get('COMMAND')).toBe("'DES=20000433;'")
  })

  it('refuses an answer for a different object', async () => {
    const wrong = {
      ...gridVectors,
      result: gridVectors.result.replace('433 Eros (A898 PA)', '248370 (2005 QN173)'),
    }
    const { ns } = queueFor(wrong)
    const { res } = await run(trajectory, path, { JPL_QUEUE: ns })
    expect(res.status).toBe(500)
    expect(res.headers.get('X-Error-Kind')).toBe('contract')
  })

  it('refuses an answer with the wrong number of samples', async () => {
    // Three samples where the span has 366.
    const { ns } = queueFor(erosVectors)
    const { res } = await run(trajectory, path, { JPL_QUEUE: ns })
    expect(res.status).toBe(500)
  })

  it('reports where the ephemeris ends instead of samples', async () => {
    const refused = {
      signature: erosVectors.signature,
      result:
        'Target body name: 433 Eros (A898 PA)\nNo ephemeris for target "433 Eros (A898 PA)" after A.D. 2100-JAN-01 00:00:00.0000 TDB\n',
    }
    const { ns } = queueFor(refused)
    const { res } = await run(trajectory, path, { JPL_QUEUE: ns })
    const body = TrajectoryResponseSchema.parse(await res.json())
    expect(body.fine).toBeNull()
    expect(body.availableTo).toBe('2100-01-01T00:00:00.000Z')
  })

  it('answers 404 for an SPK-ID SBDB does not know', async () => {
    const { ns, asked } = fakeQueue(() => ({ jplStatus: 200, body: none }))
    const { res } = await run(trajectory, path, { JPL_QUEUE: ns })
    expect(res.status).toBe(404)
    expect(asked).toHaveLength(1)
  })

  it('refuses bad parameters with 400 and a missing binding with 503', async () => {
    const { ns, asked } = queueFor()
    const bad = await run(trajectory, '/api/trajectory?id=433&start=x', { JPL_QUEUE: ns })
    expect(bad.res.status).toBe(400)
    expect(asked).toHaveLength(0)
    const off = await run(trajectory, path, {})
    expect(off.res.status).toBe(503)
    expect(off.res.headers.get(NOT_CONFIGURED_HEADER)).toBe('jpl-queue')
  })

  it('caches by object and span, so a repeat asks JPL nothing', async () => {
    const { ns, asked } = queueFor()
    const first = await run(trajectory, path, { JPL_QUEUE: ns })
    await first.settle()
    const again = await run(trajectory, path, { JPL_QUEUE: ns })
    expect(again.res.headers.get('X-Cache')).toBe('HIT')
    expect(asked).toHaveLength(2)
  })
})

describe('the client health contracts agree with these Functions (#148)', () => {
  const lookupBody = async (body: unknown, jplStatus = 200) => {
    const { ns } = fakeQueue(() => ({ jplStatus, body }))
    return (await run(lookup, '/api/lookup?q=eros', { JPL_QUEUE: ns })).res.json()
  }

  it('accepts every kind of lookup answer: an object, a list and "not found"', async () => {
    const required = SOURCES['jpl-lookup'].required
    expect(required(await lookupBody(apophis))).toBe(true)
    expect(required(await lookupBody(halley, 300))).toBe(true)
    expect(required(await lookupBody(none))).toBe(true)
  })

  it('accepts sampled vectors and an answer that says where the ephemeris ends', async () => {
    const required = SOURCES['jpl-trajectory'].required
    const path = GRID_PATH
    const answer = async (vectors: unknown) => {
      const { ns } = fakeQueue((url) =>
        url.includes('sbdb.api')
          ? { jplStatus: 200, body: eros }
          : { jplStatus: 200, body: vectors },
      )
      return (await run(trajectory, path, { JPL_QUEUE: ns })).res.json()
    }
    expect(required(await answer(erosRows(GRID_SAMPLES)))).toBe(true)
    const refused = {
      signature: erosVectors.signature,
      result:
        'Target body name: 433 Eros (A898 PA)\nNo ephemeris for target "433 Eros (A898 PA)" after A.D. 2100-JAN-01 00:00:00.0000 TDB\n',
    }
    expect(required(await answer(refused))).toBe(true)
  })
})
