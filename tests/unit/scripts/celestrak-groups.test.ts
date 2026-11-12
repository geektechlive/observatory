/**
 * The refresh job's satellite step (#98): eight CelesTrak downloads, nine disjoint KV
 * groups, one request at a time, and a failed source judged by the age of its copy.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  buildSatGroups,
  celestrakFetchText,
  celestrakGroupUrl,
  celestrakStrictFetch,
  refreshSatGroups,
  SAT_KEY,
  SATS_MAX_AGE_MS,
  SUPGP_STARLINK_URL,
  // @ts-expect-error plain ESM script, no type declarations
} from '../../../scripts/celestrak-groups.mjs'
// @ts-expect-error plain ESM script, no type declarations
import { classifyFailure } from '../../../scripts/refresh-data.mjs'

const SAMPLES = JSON.parse(
  readFileSync(join(__dirname, '..', 'fixtures', 'celestrak-omm.json'), 'utf8'),
) as Record<string, unknown[]>
const NOW = Date.UTC(2026, 10, 7, 6)
const HOUR = 3_600_000

const groupOf = (url: string) => new URL(url).searchParams.get('GROUP') ?? ''
const fromSamples = (url: string) => Promise.resolve(JSON.stringify(SAMPLES[groupOf(url)] ?? []))

interface Payload {
  group: string
  generatedAt: string
  fields: string[]
  count: number
  rows: unknown[][]
}
interface Write {
  key: string
  value: string
  metadata: { fetchedAt: string; count: number; bytes: number }
}

describe('celestrakGroupUrl', () => {
  it('asks for OMM JSON by group', () => {
    expect(celestrakGroupUrl('gps-ops')).toBe(
      'https://celestrak.org/NORAD/elements/gp.php?GROUP=gps-ops&FORMAT=json',
    )
  })
})

describe('buildSatGroups', () => {
  it('downloads the eight sources one at a time, in order', async () => {
    const asked: string[] = []
    let inFlight = 0
    let maxInFlight = 0
    const fetchText = async (url: string) => {
      inFlight += 1
      maxInFlight = Math.max(maxInFlight, inFlight)
      asked.push(groupOf(url))
      await new Promise((r) => setTimeout(r, 1))
      inFlight -= 1
      return fromSamples(url)
    }
    const { requests } = await buildSatGroups({ now: NOW, fetchText, pauseMs: 0 })
    expect(requests).toBe(8)
    expect(maxInFlight).toBe(1)
    expect(asked).toEqual([
      'active',
      'stations',
      'gps-ops',
      'weather',
      'science',
      'cosmos-2251-debris',
      'iridium-33-debris',
      'fengyun-1c-debris',
    ])
  })

  it('builds nine payloads with rows, fields and the generation time', async () => {
    const { groups, failed } = await buildSatGroups({
      now: NOW,
      fetchText: fromSamples,
      pauseMs: 0,
    })
    expect(failed).toEqual([])
    expect(groups.map((g: { id: string }) => g.id).sort()).toEqual(
      [
        'cosmos-2251-debris',
        'fengyun-1c-debris',
        'gps-ops',
        'iridium-33-debris',
        'other',
        'science',
        'starlink',
        'stations',
        'weather',
      ].sort(),
    )
    const starlink = groups.find((g: { id: string }) => g.id === 'starlink')?.payload as Payload
    expect(starlink.generatedAt).toBe(new Date(NOW).toISOString())
    expect(starlink.count).toBe(3)
    expect(starlink.rows[0]?.[1]).toBe('100001')
    expect(starlink.fields[1]).toBe('id')
  })

  it('a source that fails takes only its own groups with it', async () => {
    const fetchText = (url: string) =>
      groupOf(url) === 'weather' ? Promise.reject(new Error('HTTP 503')) : fromSamples(url)
    const { groups, failed } = await buildSatGroups({ now: NOW, fetchText, pauseMs: 0 })
    const ids = groups.map((g: { id: string }) => g.id)
    expect(ids).not.toContain('weather')
    // `other` would swallow the weather satellites without the weather list.
    expect(ids).not.toContain('other')
    expect(ids).toContain('starlink')
    expect(failed.map((f: { group: string }) => f.group).sort()).toEqual(['other', 'weather'])
  })

  it('treats a non-array or mostly unusable answer as a failure, not an empty group', async () => {
    const fetchText = (url: string) =>
      groupOf(url) === 'science'
        ? Promise.resolve('No GP data found')
        : groupOf(url) === 'gps-ops'
          ? Promise.resolve(JSON.stringify([{ OBJECT_NAME: 'X' }]))
          : fromSamples(url)
    const { failed } = await buildSatGroups({ now: NOW, fetchText, pauseMs: 0 })
    const why = Object.fromEntries(
      failed.map((f: { group: string; reason: string }) => [f.group, f.reason]),
    )
    expect(why['science']).toMatch(/not a JSON array|JSON/)
    expect(why['gps-ops']).toMatch(/usable/)
  })

  it('fails Starlink when active has no STARLINK names (a renamed catalogue)', async () => {
    const fetchText = (url: string) =>
      groupOf(url) === 'active'
        ? Promise.resolve(
            JSON.stringify(
              (SAMPLES['active'] ?? []).filter(
                (r) => !(r as { OBJECT_NAME: string }).OBJECT_NAME.startsWith('STARLINK'),
              ),
            ),
          )
        : fromSamples(url)
    const { groups, failed } = await buildSatGroups({ now: NOW, fetchText, pauseMs: 0 })
    expect(groups.map((g: { id: string }) => g.id)).not.toContain('starlink')
    expect(failed.map((f: { group: string }) => f.group)).toContain('starlink')
  })
})

describe('celestrakFetchText', () => {
  // CelesTrak's answer when the same address asks again inside its 2 h update cycle
  // (seen live 2026-11-07, after a probe had fetched `active` minutes before).
  const NOT_UPDATED =
    'GP data has not updated since your last successful\n' +
    'download of GROUP=active at 2026-11-07 04:34:21 UTC.\n' +
    'Data is updated once every 2 hours.'

  it('does not retry a 403 "not updated" and says what it means', async () => {
    let calls = 0
    const fetchImpl = () => {
      calls += 1
      return Promise.resolve(new Response(NOT_UPDATED, { status: 403 }))
    }
    const retrying = () => Promise.reject(new Error('should not be asked'))
    await expect(
      celestrakFetchText(celestrakGroupUrl('active'), { fetchImpl, retrying }),
    ).rejects.toThrow(/not updated since this address last downloaded it/)
    expect(calls).toBe(1)
  })

  it('returns the body of a 200', async () => {
    const fetchImpl = () => Promise.resolve(new Response('[]', { status: 200 }))
    await expect(celestrakFetchText('u', { fetchImpl, retrying: fetchImpl })).resolves.toBe('[]')
  })

  it('hands any other failure to the retrying fetch', async () => {
    const fetchImpl = () => Promise.resolve(new Response('busy', { status: 503 }))
    const retrying = () => Promise.resolve('[1]')
    await expect(celestrakFetchText('u', { fetchImpl, retrying })).resolves.toBe('[1]')
  })
})

describe('Starlink from CelesTrak SupGP (#209)', () => {
  // SpaceX-derived elements for two of the three Starlinks in the samples, plus one the
  // `active` slice lacks (a pre-catalogue or cross-tagged object).
  const starlinks = (SAMPLES['active'] ?? []).filter((r) =>
    (r as { OBJECT_NAME: string }).OBJECT_NAME.startsWith('STARLINK'),
  ) as Record<string, unknown>[]
  const SUPGP = JSON.stringify([
    ...starlinks
      .slice(0, 2)
      .map((r) => ({ ...r, MEAN_MOTION: 15.123456789, DATA_SOURCE: 'SpaceX-E', RMS: '0.275' })),
    { ...starlinks[0], NORAD_CAT_ID: 999999, OBJECT_NAME: 'STARLINK-NEW', DATA_SOURCE: 'SpaceX-E' },
  ])
  const isSupGp = (url: string) => url === SUPGP_STARLINK_URL

  it('asks for the Starlink SupGP file as OMM JSON', () => {
    expect(SUPGP_STARLINK_URL).toBe(
      'https://celestrak.org/NORAD/elements/supplemental/sup-gp.php?FILE=starlink&FORMAT=json',
    )
  })

  it('downloads it once, after the eight GP groups, and prefers it by NORAD id', async () => {
    const asked: string[] = []
    const { groups, requests, supplemental } = await buildSatGroups({
      now: NOW,
      fetchText: (url: string) => {
        asked.push(url)
        return fromSamples(url)
      },
      fetchSupText: (url: string) => {
        asked.push(url)
        return Promise.resolve(SUPGP)
      },
      pauseMs: 0,
    })
    expect(requests).toBe(9)
    expect(asked.at(-1)).toBe(SUPGP_STARLINK_URL)
    expect(asked.filter(isSupGp)).toHaveLength(1)
    const starlink = groups.find((g: { id: string }) => g.id === 'starlink')?.payload as Payload & {
      supgpCount: number
    }
    expect(starlink.count).toBe(3)
    expect(starlink.supgpCount).toBe(2)
    expect(starlink.rows.slice(0, 2).map((r) => r[4])).toEqual([15.123456789, 15.123456789])
    expect(starlink.rows.map((r) => r[1])).not.toContain('999999')
    expect(supplemental).toEqual({ matched: 2, gpOnly: 1, supplementalOnly: 1, error: null })
  })

  it('a failed SupGP download leaves Starlink on GP elements, as a warning', async () => {
    const { entry, writes } = await refreshSatGroups({
      now: NOW,
      fetchText: fromSamples,
      fetchSupText: () => Promise.reject(new Error('CelesTrak SupGP: HTTP 503, not retried')),
      pauseMs: 0,
      readPrevious: () => Promise.resolve(null),
      classifyFailure,
    })
    expect(entry.ok).toBe(true)
    expect(entry.warning).toBe(true)
    expect(entry.detail).toMatch(/SupGP.*503/)
    const starlink = JSON.parse(
      (writes as Write[]).find((w) => w.key === SAT_KEY('starlink'))?.value ?? '{}',
    ) as { count: number; supgpCount: number }
    expect(starlink.count).toBe(3)
    expect(starlink.supgpCount).toBe(0)
  })

  it('is not asked once any earlier CelesTrak request failed', async () => {
    let supAsked = 0
    const { supplemental } = await buildSatGroups({
      now: NOW,
      fetchText: (url: string) =>
        groupOf(url) === 'weather' ? Promise.reject(new Error('HTTP 503')) : fromSamples(url),
      fetchSupText: () => {
        supAsked += 1
        return Promise.resolve(SUPGP)
      },
      pauseMs: 0,
    })
    expect(supAsked).toBe(0)
    expect(supplemental.error).toMatch(/not asked/)
  })

  it('reports the counts in the step detail', async () => {
    const { entry } = await refreshSatGroups({
      now: NOW,
      fetchText: fromSamples,
      fetchSupText: () => Promise.resolve(SUPGP),
      pauseMs: 0,
      readPrevious: () => Promise.resolve(null),
      classifyFailure,
    })
    expect(entry.ok).toBe(true)
    expect(entry.warning).toBe(false)
    expect(entry.detail).toMatch(/SupGP 2 of 3 Starlink/)
  })
})

describe('celestrakStrictFetch (#209)', () => {
  it('returns the body of a 200', async () => {
    const fetchImpl = () => Promise.resolve(new Response('[]', { status: 200 }))
    await expect(celestrakStrictFetch('u', { fetchImpl, timeoutMs: 1000 })).resolves.toBe('[]')
  })

  it.each([201, 304, 403, 404, 429, 503])(
    'stops at once on HTTP %i, with no retry',
    async (status) => {
      let calls = 0
      const fetchImpl = () => {
        calls += 1
        return Promise.resolve(new Response(status === 304 ? null : 'no', { status }))
      }
      await expect(celestrakStrictFetch('u', { fetchImpl, timeoutMs: 1000 })).rejects.toThrow(
        new RegExp(`HTTP ${String(status)}`),
      )
      expect(calls).toBe(1)
    },
  )
})

describe('refreshSatGroups', () => {
  it('writes one KV key per group with count, bytes and age as metadata', async () => {
    const { entry, writes } = await refreshSatGroups({
      now: NOW,
      fetchText: fromSamples,
      pauseMs: 0,
      readPrevious: () => Promise.resolve(null),
      classifyFailure,
    })
    expect(entry.ok).toBe(true)
    expect(entry.warning).toBe(false)
    expect(writes).toHaveLength(9)
    const stations = (writes as Write[]).find((w) => w.key === SAT_KEY('stations'))
    expect(stations?.key).toBe('celestrak:gp:stations:v1')
    expect(stations?.metadata.fetchedAt).toBe(new Date(NOW).toISOString())
    expect(stations?.metadata.count).toBe(2)
    expect(stations?.metadata.bytes).toBe(stations?.value.length)
  })

  it('a failed group is a warning while its KV copy is under 36 h old', async () => {
    const fetchText = (url: string) =>
      groupOf(url) === 'science' ? Promise.reject(new Error('HTTP 503')) : fromSamples(url)
    const young = JSON.stringify({ generatedAt: new Date(NOW - 10 * HOUR).toISOString() })
    const { entry, writes } = await refreshSatGroups({
      now: NOW,
      fetchText,
      pauseMs: 0,
      readPrevious: () => Promise.resolve(young),
      classifyFailure,
    })
    expect(SATS_MAX_AGE_MS).toBe(36 * HOUR)
    expect(entry.ok).toBe(true)
    expect(entry.warning).toBe(true)
    expect(entry.detail).toMatch(/science/)
    expect((writes as Write[]).map((w) => w.key)).not.toContain(SAT_KEY('science'))
  })

  it('is an incident once a failed group has no copy younger than 36 h', async () => {
    const fetchText = (url: string) =>
      groupOf(url) === 'science' ? Promise.reject(new Error('HTTP 503')) : fromSamples(url)
    const old = JSON.stringify({ generatedAt: new Date(NOW - 40 * HOUR).toISOString() })
    const { entry } = await refreshSatGroups({
      now: NOW,
      fetchText,
      pauseMs: 0,
      readPrevious: () => Promise.resolve(old),
      classifyFailure,
    })
    expect(entry.ok).toBe(false)
    expect(entry.detail).toMatch(/FAIL/)
  })

  it('reads a previous copy only for a group that failed', async () => {
    const read: string[] = []
    await refreshSatGroups({
      now: NOW,
      fetchText: (url: string) =>
        groupOf(url) === 'weather' ? Promise.reject(new Error('down')) : fromSamples(url),
      pauseMs: 0,
      readPrevious: (key: string) => {
        read.push(key)
        return Promise.resolve(null)
      },
      classifyFailure,
    })
    expect(read.sort()).toEqual([SAT_KEY('other'), SAT_KEY('weather')].sort())
  })
})
