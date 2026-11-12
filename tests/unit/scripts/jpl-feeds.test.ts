/**
 * The planets, Sentry and fireball feeds, built by the refresh job (#146) so a visitor
 * request never reaches JPL. Planets ask Horizons one body at a time (#88); the three
 * payloads must still parse with the schemas the client uses.
 */
import { describe, expect, it } from 'vitest'

import { FireballResponseSchema } from '@/schemas/fireball'
import { PlanetsResponseSchema } from '@/schemas/planets'
import { SentryResponseSchema } from '@/schemas/sentry'

import {
  buildJplFeeds,
  PLANET_BODIES,
  // @ts-expect-error plain ESM script, no type declarations
} from '../../../scripts/jpl-feeds.mjs'

const NOW = Date.UTC(2026, 10, 12, 6, 17)

const RESULT = `... header ...
$$SOE
 2026-Nov-12 00:00     03 18 14.81 +17 47 39.4    1.333   4.226   34.5789 /L
 2026-Nov-13 00:00     03 21 10.66 +17 59 25.4    1.329   4.224   34.8094 /L
$$EOE
... footer ...`

const SENTRY = {
  count: '3',
  data: [
    { des: '1', fullname: 'A', ps_cum: '-3.0', ip: '1e-5', n_imp: 2, diameter: null, extra: 'x' },
    { des: '2', fullname: 'B', ps_cum: '-1.5', ip: '1e-4', n_imp: 7, diameter: '0.5' },
    { des: '3', fullname: 'C', ps_cum: '-9.9', ip: '1e-9', n_imp: 1 },
  ],
}

const FIREBALL = {
  count: '2',
  fields: ['date', 'energy', 'impact-e', 'lat', 'lat-dir', 'lon', 'lon-dir', 'alt', 'vel'],
  data: [
    ['2026-11-10 01:02:03', '2.1', '0.07', '12.3', 'N', '45.6', 'E', '33.0', '14.2'],
    ['2026-11-09 04:05:06', '0.5', null, null, null, null, null, null, null],
  ],
}

interface Fakes {
  horizons: string[]
  jsonUrls: string[]
  fetchHorizonsText: (url: string) => Promise<string>
  fetchJson: (url: string) => Promise<unknown>
}

/** JPL as the job meets it: one request at a time, an overlapping one is refused. */
function fakes(down: string[] = [], sentryDown = false, fireballDown = false): Fakes {
  let inFlight = 0
  const horizons: string[] = []
  const jsonUrls: string[] = []
  const guard = async <T>(fn: () => T): Promise<T> => {
    inFlight += 1
    try {
      await new Promise((r) => setTimeout(r, 2))
      if (inFlight > 1) throw new Error('HTTP 503 (overlap)')
      return fn()
    } finally {
      inFlight -= 1
    }
  }
  return {
    horizons,
    jsonUrls,
    fetchHorizonsText: (url) =>
      guard(() => {
        const id = (new URL(url).searchParams.get('COMMAND') ?? '').replaceAll("'", '')
        horizons.push(url)
        if (down.includes(id)) throw new Error('HTTP 503')
        return RESULT
      }),
    fetchJson: (url) =>
      guard(() => {
        jsonUrls.push(url)
        if (url.includes('sentry')) {
          if (sentryDown) throw new Error('HTTP 503')
          return SENTRY
        }
        if (fireballDown) throw new Error('HTTP 503')
        return FIREBALL
      }),
  }
}

const run = (f: Fakes, extra: Record<string, unknown> = {}) =>
  buildJplFeeds({
    now: NOW,
    pauseMs: 0,
    fetchHorizonsText: f.fetchHorizonsText,
    fetchJson: f.fetchJson,
    ...extra,
  })

describe('buildJplFeeds planets (#146)', () => {
  it('asks Horizons one body at a time for today and tomorrow, in the old order', async () => {
    const f = fakes()
    const out = await run(f)
    expect(f.horizons).toHaveLength(9)
    expect(PLANET_BODIES.map((b: { name: string }) => b.name)).toEqual([
      'Sun',
      'Moon',
      'Mercury',
      'Venus',
      'Mars',
      'Jupiter',
      'Saturn',
      'Uranus',
      'Neptune',
    ])
    const p = new URL(f.horizons[0] ?? '').searchParams
    expect(p.get('START_TIME')).toBe('2026-11-12')
    expect(p.get('STOP_TIME')).toBe('2026-11-13')
    expect(p.get('CENTER')).toBe('500@399')
    expect(p.get('QUANTITIES')).toBe("'1,9,23'")
    expect(out.planets.missing).toEqual([])
  })

  it('writes the shape the client parses, stamped with the job time', async () => {
    const out = await run(fakes())
    const body = PlanetsResponseSchema.parse(out.planets.payload)
    expect(body.updatedAt).toBe(new Date(NOW).toISOString())
    expect(body.bodies).toHaveLength(9)
    expect(body.bodies[0]).toMatchObject({ name: 'Sun', mag: 1.333, elongation: 34.5789 })
  })

  it('ships a partial answer and names the bodies it lacks', async () => {
    const out = await run(fakes(['599']))
    const names = out.planets.payload.bodies.map((b: { name: string }) => b.name)
    expect(names).not.toContain('Jupiter')
    expect(names).toHaveLength(8)
    expect(out.planets.missing).toEqual(['Jupiter'])
  })

  it('fails planets, not the other feeds, when no body answers', async () => {
    const all = PLANET_BODIES.map((b: { id: string }) => b.id)
    const out = await run(fakes(all))
    expect(out.planets.error).toMatch(/no body/i)
    expect(out.planets.payload).toBeUndefined()
    expect(out.sentry.payload).toBeDefined()
    expect(out.fireball.payload).toBeDefined()
  })
})

describe('buildJplFeeds sentry and fireball (#146)', () => {
  it('keeps the 50 highest Palermo scale objects and only the known fields', async () => {
    const out = await run(fakes())
    const body = SentryResponseSchema.parse(out.sentry.payload)
    expect(body.count).toBe('3')
    expect(body.data.map((d) => d.des)).toEqual(['2', '1', '3'])
    expect(Object.keys(out.sentry.payload.data[0])).not.toContain('extra')
    expect(out.sentry.payload.updatedAt).toBe(new Date(NOW).toISOString())
  })

  it('caps Sentry at 50', async () => {
    const many = {
      count: '120',
      data: Array.from({ length: 120 }, (_, i) => ({ des: String(i), ps_cum: String(-(i + 1)) })),
    }
    const f = fakes()
    const out = await run({ ...f, fetchJson: () => Promise.resolve(many) })
    expect(out.sentry.payload.data).toHaveLength(50)
    expect(out.sentry.payload.data[0].des).toBe('0')
  })

  it('maps the fireball table to named rows the client parses', async () => {
    const out = await run(fakes())
    const body = FireballResponseSchema.parse(out.fireball.payload)
    expect(body.count).toBe('2')
    expect(body.data[0]).toEqual({
      date: '2026-11-10 01:02:03',
      energy: '2.1',
      impactE: '0.07',
      lat: '12.3',
      latDir: 'N',
      lon: '45.6',
      lonDir: 'E',
      alt: '33.0',
      vel: '14.2',
    })
    expect(body.data[1]?.impactE).toBeNull()
  })

  it('asks the same JPL endpoints as before', async () => {
    const f = fakes()
    await run(f)
    expect(f.jsonUrls).toEqual([
      'https://ssd-api.jpl.nasa.gov/sentry.api',
      'https://ssd-api.jpl.nasa.gov/fireball.api?limit=30',
    ])
  })

  it('rejects a Sentry answer with no objects, or a fireball answer with no rows', async () => {
    const f = fakes()
    const empty = await run({
      ...f,
      fetchJson: (url: string) =>
        Promise.resolve(
          url.includes('sentry') ? { count: '0', data: [] } : { fields: [], data: [] },
        ),
    })
    expect(empty.sentry.error).toMatch(/sentry/i)
    expect(empty.fireball.error).toMatch(/fireball/i)
  })

  it('rejects a Sentry object whose fields break the schema', async () => {
    const f = fakes()
    const out = await run({
      ...f,
      fetchJson: (url: string) =>
        Promise.resolve(
          url.includes('sentry') ? { count: '1', data: [{ des: 5, ps_cum: '-1' }] } : FIREBALL,
        ),
    })
    expect(out.sentry.error).toMatch(/sentry/i)
    expect(out.fireball.payload).toBeDefined()
  })

  it('fails one feed without the others', async () => {
    const out = await run(fakes([], true, false))
    expect(out.sentry.error).toMatch(/503/)
    expect(out.planets.payload).toBeDefined()
    expect(out.fireball.payload).toBeDefined()
  })
})

describe('buildJplFeeds pacing and budget (#146)', () => {
  it('never overlaps its requests', async () => {
    const f = fakes()
    const out = await run(f)
    // The fake refuses any overlap, so a clean run proves the requests were serial.
    expect(out.requests).toBe(11)
    expect(out.planets.missing).toEqual([])
    expect(out.sentry.error).toBeUndefined()
    expect(out.fireball.error).toBeUndefined()
  })

  it('stops asking once the budget is spent: the planets, asked last, are cut short', async () => {
    let t = 0
    const f = fakes()
    const out = await run(f, {
      budgetMs: 1500,
      clock: () => t,
      fetchHorizonsText: (url: string) => {
        t += 600
        return f.fetchHorizonsText(url)
      },
      fetchJson: (url: string) => {
        t += 100
        return f.fetchJson(url)
      },
    })
    // Sentry and fireball first (200 ms), then 600 ms a body: the third body starts past 1500 ms.
    expect(out.sentry.payload).toBeDefined()
    expect(out.fireball.payload).toBeDefined()
    expect(out.planets.missing).toHaveLength(PLANET_BODIES.length - 3)
    expect(out.requests).toBe(5)
  })

  it('keeps Sentry and fireball when Horizons is down and every body is slow to fail', async () => {
    // Each failing body burns its retries (fetchWithRetry: about 20 s on a 503, up to 80 s).
    let t = 0
    const f = fakes()
    const out = await run(f, {
      budgetMs: 60_000,
      clock: () => t,
      fetchHorizonsText: () => {
        t += 20_000
        return Promise.reject(new Error('HTTP 503'))
      },
    })
    expect(out.sentry.payload).toBeDefined()
    expect(out.fireball.payload).toBeDefined()
    expect(out.planets.error).toMatch(/no body/i)
  })

  it('does not ask at all with a negative budget (the job deadline has passed)', async () => {
    const f = fakes()
    const out = await run(f, { budgetMs: -1 })
    expect(out.requests).toBe(0)
    expect(out.planets.error).toBeDefined()
  })
})
