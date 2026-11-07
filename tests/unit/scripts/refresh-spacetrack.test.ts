/**
 * The refresh job's Space-Track step (#101) as refresh-data.mjs runs it: skipped with a
 * warning when the account isn't configured, KV writes for the catalogue, the SATCAT
 * shards and the history, and a failure judged by the age of the catalogue it replaces.
 */
import { describe, expect, it } from 'vitest'

import {
  discosTargets,
  KEY_DISCOS,
  KEY_SPACETRACK_CATALOG,
  KEY_SPACETRACK_HISTORY,
  refreshDiscos,
  refreshSpaceTrack,
  SPACETRACK_SATCAT_KEY,
  // @ts-expect-error plain ESM script, no type declarations
} from '../../../scripts/refresh-data.mjs'

const HOUR = 3_600_000
const NOW = Date.UTC(2026, 10, 8, 18, 17)
const ENV = { SPACETRACK_USER: 'someone@example.invalid', SPACETRACK_PASS: 'not-real' }

/** A synthetic Space-Track that answers every class, with a SATCAT of `satcat` objects. */
function http(satcat = 12_000, loginOk = true) {
  return (url: string) => {
    if (url.endsWith('/ajaxauth/login')) {
      return Promise.resolve(
        loginOk
          ? new Response('""', { headers: { 'Set-Cookie': 'chocolatechip=x; path=/' } })
          : new Response('{"Login":"Failed"}'),
      )
    }
    if (url.endsWith('/ajaxauth/logout')) return Promise.resolve(new Response('""'))
    const cls = /\/class\/([a-z_]+)\//.exec(url)?.[1]
    const body =
      cls === 'satcat'
        ? Array.from({ length: satcat }, (_, i) => ({ NORAD_CAT_ID: String(i + 1) }))
        : cls === 'boxscore'
          ? [
              {
                COUNTRY: 'ALL',
                ORBITAL_TBA: '1',
                ORBITAL_PAYLOAD_COUNT: '2',
                ORBITAL_ROCKET_BODY_COUNT: '3',
                ORBITAL_DEBRIS_COUNT: '4',
                ORBITAL_TOTAL_COUNT: '10',
                DECAYED_PAYLOAD_COUNT: '1',
                DECAYED_ROCKET_BODY_COUNT: '1',
                DECAYED_DEBRIS_COUNT: '1',
                DECAYED_TOTAL_COUNT: '3',
                COUNTRY_TOTAL: '13',
              },
            ]
          : []
    return Promise.resolve(new Response(JSON.stringify(body)))
  }
}

const deps = (over: Record<string, unknown> = {}) => ({
  env: ENV,
  now: NOW,
  http: http(),
  previousCatalogText: null,
  previousHistoryText: null,
  pauseMs: 0,
  ...over,
})

describe('refreshSpaceTrack (#101)', () => {
  it('skips with a warning, and writes nothing, when the account is not configured', async () => {
    const { entry, writes } = await refreshSpaceTrack(null, deps({ env: {} }))
    expect(entry).toMatchObject({ signature: 'refresh:spacetrack', ok: true, warning: true })
    expect(entry.detail).toMatch(/SPACETRACK_USER/)
    expect(writes).toEqual([])
  })

  it('writes the catalogue, the 16 SATCAT shards and the history, each with its time', async () => {
    const { entry, writes } = await refreshSpaceTrack(null, deps())
    expect(entry.ok).toBe(true)
    const keys = writes.map((w: { key: string }) => w.key)
    expect(keys).toContain(KEY_SPACETRACK_CATALOG)
    expect(keys).toContain(KEY_SPACETRACK_HISTORY)
    expect(keys.filter((k: string) => k.startsWith('spacetrack:satcat:'))).toHaveLength(16)
    expect(keys).toContain(SPACETRACK_SATCAT_KEY(0))
    for (const w of writes) expect(w.metadata.fetchedAt).toBe(new Date(NOW).toISOString())
    const shard1 = JSON.parse(
      writes.find((w: { key: string }) => w.key === SPACETRACK_SATCAT_KEY(1)).value,
    )
    expect(shard1.rows.length).toBe(750)
  })

  it('never writes the account into a KV value or the report', async () => {
    const { entry, writes } = await refreshSpaceTrack(null, deps())
    const all = JSON.stringify({ entry, writes })
    expect(all).not.toContain('example.invalid')
    expect(all).not.toContain('not-real')
  })

  it('judges a failed login by the age of the catalogue it would replace (36 h)', async () => {
    const failing = deps({ http: http(12_000, false) })
    const young = JSON.stringify({ generatedAt: new Date(NOW - 20 * HOUR).toISOString() })
    const old = JSON.stringify({ generatedAt: new Date(NOW - 40 * HOUR).toISOString() })
    const a = await refreshSpaceTrack(null, { ...failing, previousCatalogText: young })
    expect(a.entry.ok).toBe(true)
    expect(a.writes).toEqual([])
    const b = await refreshSpaceTrack(null, { ...failing, previousCatalogText: old })
    expect(b.entry.ok).toBe(false)
    expect(b.entry.detail).toMatch(/refresh:spacetrack.*login failed/)
  })

  it('asks nothing once the job deadline has passed (#128)', async () => {
    let asked = 0
    const counting = (url: string) => {
      asked += 1
      return http()(url)
    }
    const young = JSON.stringify({ generatedAt: new Date(NOW - 2 * HOUR).toISOString() })
    const { entry, writes } = await refreshSpaceTrack(
      null,
      deps({ http: counting, budgetMs: -1, previousCatalogText: young }),
    )
    expect(asked).toBe(0)
    expect(entry.ok).toBe(true)
    expect(writes).toEqual([])
  })
})

describe('refreshDiscos (#101)', () => {
  const discosHttp = (url: string) => {
    const filter = new URL(url).searchParams.get('filter') ?? ''
    const ids = filter.startsWith('in(satno')
      ? (/\(([\d,]+)\)/.exec(filter)?.[1]?.split(',') ?? [])
      : []
    const data = ids.map((n) => ({
      type: 'object',
      id: n,
      attributes: { satno: Number(n), name: `SAT ${n}`, mass: 1 },
      relationships: { operators: { data: [] } },
    }))
    return Promise.resolve(new Response(JSON.stringify({ data, included: [] })))
  }

  it('skips with a warning when the token is not configured', async () => {
    const { entry, writes } = await refreshDiscos(null, { env: {}, now: NOW, satnos: ['25544'] })
    expect(entry).toMatchObject({ signature: 'refresh:discos', ok: true, warning: true })
    expect(writes).toEqual([])
  })

  it('writes discos:objects:v1 when it changed, without the token', async () => {
    const { entry, writes } = await refreshDiscos(null, {
      env: { DISCOSWEB_TOKEN: 'tok-not-real' },
      now: NOW,
      http: discosHttp,
      satnos: ['25544'],
      previousText: null,
      pauseMs: 0,
    })
    expect(entry.ok).toBe(true)
    expect(writes.map((w: { key: string }) => w.key)).toEqual([KEY_DISCOS])
    expect(writes[0].value).not.toContain('tok-not-real')
    expect(JSON.parse(writes[0].value).satellites['25544'].name).toBe('SAT 25544')
  })

  it('takes its satellites from the stations group, the history objects and the re-entries', () => {
    const stations = JSON.stringify({
      rows: [
        ['ISS (ZARYA)', '25544'],
        ['CSS (TIANHE)', '48274'],
      ],
    })
    const catalog = { tip: { reentries: [{ noradId: '45700' }] } }
    expect(discosTargets(stations, catalog)).toEqual(['25544', '48274', '20580', '45700'])
  })
})
