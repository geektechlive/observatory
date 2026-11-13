import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { CHARON, DWARFS } from '@/lib/orrery/dwarfs'

import {
  classifyFailure,
  describePayload,
  fetchWithRetry,
  isValidLaunchesPayload,
  KEY_COMETS_TONIGHT,
  KEY_FIREBALL,
  KEY_ORRERY_BODIES,
  KEY_ORRERY_DWARFS,
  KEY_ORRERY_NEO,
  KEY_ORRERY_SMALLBODIES,
  KEY_PLANETS,
  KEY_SENTRY,
  kvPutInit,
  parseTle,
  refreshJplFeeds,
  refreshOrreryBodies,
  refreshOrreryDwarfs,
  refreshOrreryNeo,
  refreshOrrerySmallBodies,
  tleChecksumOk,
  // @ts-expect-error plain ESM script, no type declarations
} from '../../../scripts/refresh-data.mjs'

const HOUR = 3_600_000

// Real ISS TLE fetched from CelesTrak on 2026-09-07.
const LINE1 = '1 25544U 98067A   26250.17589239  .00004561  00000+0  90859-4 0  9999'
const LINE2 = '2 25544  51.6308 254.3052 0005020 115.4261 244.7248 15.49013499584466'
const NAME = 'ISS (ZARYA)'

// CelesTrak pads the name line out to 24 characters.
const TLE_TEXT = `${NAME.padEnd(24)}\n${LINE1}\n${LINE2}\n`

/** Flip one digit so the checksum no longer matches, keeping the 69-char length. */
function corrupt(line: string): string {
  const digit = Number(line[20])
  return `${line.slice(0, 20)}${(digit + 1) % 10}${line.slice(21)}`
}

describe('tleChecksumOk', () => {
  it('accepts both lines of a real ISS TLE', () => {
    expect(tleChecksumOk(LINE1)).toBe(true)
    expect(tleChecksumOk(LINE2)).toBe(true)
  })

  it('rejects a line with a corrupted digit', () => {
    const bad = corrupt(LINE1)
    expect(bad).not.toBe(LINE1)
    expect(bad.length).toBe(69)
    expect(tleChecksumOk(bad)).toBe(false)
  })

  it('rejects lines of the wrong length and non-strings', () => {
    expect(tleChecksumOk(LINE1.slice(0, 68))).toBe(false)
    expect(tleChecksumOk(`${LINE1} `)).toBe(false)
    expect(tleChecksumOk(undefined)).toBe(false)
    expect(tleChecksumOk(12345)).toBe(false)
  })
})

describe('parseTle', () => {
  it('parses a real CelesTrak block and trims the padded name', () => {
    expect(parseTle(TLE_TEXT)).toEqual({ name: NAME, line1: LINE1, line2: LINE2 })
  })

  it('rejects a block whose checksum is corrupted', () => {
    expect(parseTle(`${NAME}\n${corrupt(LINE1)}\n${LINE2}`)).toBeNull()
  })

  it('rejects a block with the wrong number of lines', () => {
    expect(parseTle(`${NAME}\n${LINE1}`)).toBeNull()
    expect(parseTle(`${NAME}\n${LINE1}\n${LINE2}\n${LINE2}`)).toBeNull()
  })

  it('rejects swapped or mislabelled lines', () => {
    expect(parseTle(`${NAME}\n${LINE2}\n${LINE1}`)).toBeNull()
  })

  it('rejects lines that are not 69 characters', () => {
    expect(parseTle(`${NAME}\n${LINE1.slice(0, 68)}\n${LINE2}`)).toBeNull()
  })

  it('rejects an empty name line and non-string input', () => {
    expect(parseTle(`\n${LINE1}\n${LINE2}`)).toBeNull()
    expect(parseTle(null)).toBeNull()
  })
})

describe('isValidLaunchesPayload', () => {
  it('accepts a RocketLaunch.live shaped payload', () => {
    expect(isValidLaunchesPayload({ valid_auth: true, count: 1, result: [{ id: 1 }] })).toBe(true)
  })

  it('rejects payloads missing result or count', () => {
    expect(isValidLaunchesPayload({ count: 1 })).toBe(false)
    expect(isValidLaunchesPayload({ result: [] })).toBe(false)
    expect(isValidLaunchesPayload(null)).toBe(false)
    expect(isValidLaunchesPayload('nope')).toBe(false)
  })
})

describe('describePayload', () => {
  it('names the keys of a JSON object and quotes the start of the body', () => {
    const out = describePayload('{"error":"rate limited","retry":30}')
    expect(out).toContain('keys=[error,retry]')
    expect(out).toContain('rate limited')
  })

  it('handles a non-JSON body and caps the excerpt at 300 characters', () => {
    const out = describePayload(`<html>${'x'.repeat(1000)}</html>`)
    expect(out).toContain('not JSON')
    expect(out.length).toBeLessThan(400)
  })
})

describe('fetchWithRetry', () => {
  const noDelay = () => 0
  const ok = (body: string) => new Response(body, { status: 200 })

  it('retries when the payload fails validation, then returns the validated value', async () => {
    // 2026-10-09: RLL answered 200 with an unexpected shape once, and was fine
    // within the hour. A shape failure gets the same retries as a network one.
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(ok('{"error":"busy"}'))
      .mockResolvedValueOnce(ok('{"count":1,"result":[]}'))
    const validate = (text: string) => {
      const json = JSON.parse(text) as unknown
      if (!isValidLaunchesPayload(json)) throw new Error('unexpected RLL payload shape')
      return json
    }

    const out = await fetchWithRetry(
      'https://x.test',
      {},
      { validate, fetchImpl, delayMs: noDelay },
    )

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(out).toEqual({ count: 1, result: [] })
  })

  it('reports what came back when every attempt fails validation', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => ok('{"error":"busy"}'))
    const validate = () => {
      throw new Error('unexpected RLL payload shape')
    }

    await expect(
      fetchWithRetry('https://x.test', {}, { validate, fetchImpl, delayMs: noDelay }),
    ).rejects.toThrow(/unexpected RLL payload shape.*keys=\[error\]/)
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('retries a non-2xx status', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 522 }))
      .mockResolvedValueOnce(ok('fine'))

    const out = await fetchWithRetry('https://x.test', {}, { fetchImpl, delayMs: noDelay })

    expect(out).toBe('fine')
  })
})

describe('classifyFailure', () => {
  const now = Date.parse('2026-10-09T12:00:00Z')
  const envelope = (hoursOld: number) =>
    JSON.stringify({ fetchedAt: new Date(now - hoursOld * HOUR).toISOString(), data: {} })
  const err = new Error('fetch failed')

  it('tolerates a failure while the KV copy is younger than its max age', () => {
    const out = classifyFailure({ err, envelopeText: envelope(12), maxAgeMs: 36 * HOUR, now })
    expect(out.ok).toBe(true)
    // Tolerated, not recovered: report-incidents keeps an open issue open.
    expect(out.warning).toBe(true)
    expect(out.detail).toMatch(/WARN.*fetch failed.*12h old/)
  })

  it('is an incident once the KV copy is older than its max age', () => {
    const out = classifyFailure({ err, envelopeText: envelope(40), maxAgeMs: 36 * HOUR, now })
    expect(out.ok).toBe(false)
    expect(out.detail).toMatch(/FAIL.*40h old/)
  })

  it('is an incident when there is no usable KV copy', () => {
    expect(classifyFailure({ err, envelopeText: null, maxAgeMs: 36 * HOUR, now }).ok).toBe(false)
    expect(classifyFailure({ err, envelopeText: 'garbage', maxAgeMs: 36 * HOUR, now }).ok).toBe(
      false,
    )
  })

  it('is an incident when the KV age could not be checked (dry run, KV read failed)', () => {
    const out = classifyFailure({ err, envelopeText: undefined, maxAgeMs: 36 * HOUR, now })
    expect(out.ok).toBe(false)
    expect(out.detail).toMatch(/age unknown/)
  })
})

describe('kvPutInit (#93)', () => {
  it('sends a plain text body when there is no metadata', () => {
    const init = kvPutInit('v', undefined, 't')
    expect(init.headers['Content-Type']).toBe('text/plain')
    expect(init.body).toBe('v')
  })

  it('sends value and metadata in one multipart write', async () => {
    const init = kvPutInit('{"a":1}', { fetchedAt: '2026-11-06T12:00:00.000Z' }, 't')
    const form = init.body as FormData
    expect(form.get('value')).toBe('{"a":1}')
    expect(JSON.parse(form.get('metadata') as string)).toEqual({
      fetchedAt: '2026-11-06T12:00:00.000Z',
    })
    // fetch sets the multipart boundary itself; a hand-set Content-Type would break it.
    expect(init.headers['Content-Type']).toBeUndefined()
  })
})

describe('refreshOrreryBodies (#93)', () => {
  const NOW = Date.UTC(2026, 10, 6, 12)
  /** Any span answered with uniform samples, so every body succeeds. */
  const anySpan = async (url: string) => {
    const p = new URL(url).searchParams
    const num = (v: string | null) => Number((v ?? '').replace(/'|JD/g, ''))
    const stepRaw = (p.get('STEP_SIZE') ?? '').replace(/'/g, '')
    const step = stepRaw.endsWith(' h')
      ? Number(stepRaw.slice(0, -2)) / 24
      : Number(stepRaw.slice(0, -2))
    const start = num(p.get('START_TIME'))
    const n = Math.round((num(p.get('STOP_TIME')) - start) / step) + 1
    const id = (p.get('COMMAND') ?? '').replace(/'/g, '')
    const rows = Array.from(
      { length: n },
      (_, i) => `${String(start + i * step)}, A.D. x, 1, 0.5, 0, 0, 0.017, 0,`,
    )
    return `Target body name: X (${id})\n$$SOE\n${rows.join('\n')}\n$$EOE\n`
  }

  it('writes the finished body with its age as KV metadata', async () => {
    const { entry, write } = await refreshOrreryBodies(null, {
      now: NOW,
      fetchText: anySpan,
      previousText: null,
      pauseMs: 0,
    })
    expect(entry.ok).toBe(true)
    expect(write.key).toBe(KEY_ORRERY_BODIES)
    expect(write.metadata.fetchedAt).toBe(new Date(NOW).toISOString())
    expect(JSON.parse(write.value).bodies.length).toBe(write.metadata.bodies)
  })

  it('ships a partial refresh, with the missing objects as a warning', async () => {
    const fetchText = async (url: string) =>
      new URL(url).searchParams.get('COMMAND') === "'-49'" ? 'no data' : anySpan(url)
    const { entry, write } = await refreshOrreryBodies(null, {
      now: NOW,
      fetchText,
      previousText: null,
      pauseMs: 0,
    })
    expect(entry.ok).toBe(true)
    expect(entry.warning).toBe(true)
    expect(entry.detail).toMatch(/missing naif:-49/)
    expect(write.metadata.missing).toBe(1)
  })

  it('judges a total failure by the age of the copy it would replace', async () => {
    const fail = async () => {
      throw new Error('HTTP 503')
    }
    const young = JSON.stringify({
      generatedAt: new Date(NOW - 10 * HOUR).toISOString(),
      bodies: [],
    })
    const old = JSON.stringify({ generatedAt: new Date(NOW - 80 * HOUR).toISOString(), bodies: [] })
    const a = await refreshOrreryBodies(null, {
      now: NOW,
      fetchText: fail,
      previousText: young,
      pauseMs: 0,
    })
    expect(a.entry.ok).toBe(true)
    expect(a.write).toBeUndefined()
    const b = await refreshOrreryBodies(null, {
      now: NOW,
      fetchText: fail,
      previousText: old,
      pauseMs: 0,
    })
    expect(b.entry.ok).toBe(false)
  })
})

describe('refreshOrreryNeo (#92)', () => {
  const NOW = Date.UTC(2026, 10, 7, 4)
  // Two approaches: one numbered, one provisional; Scout and NEOCC tables minimal.
  const CAD = {
    signature: { version: '1.5' },
    count: 2,
    fields: ['des', 'orbit_id', 'jd', 'cd', 'dist', 'dist_min', 'dist_max', 'v_rel', 'fullname'],
    data: [
      [
        '524522',
        '99',
        '2461347.3',
        '2026-Nov-02 19:10',
        '0.04',
        '0.039',
        '0.041',
        '8.7',
        '524522 Zoozve',
      ],
      [
        '2026 UE2',
        '4',
        '2461342.5',
        '2026-Oct-29 01:26',
        '0.0008',
        '0.0007',
        '0.0009',
        '7.6',
        '(2026 UE2)',
      ],
    ],
  }
  const NEOCC_HEADER =
    'Last Update: 2026-11-07 04:20 UTC\n t\n c\nAAAAAAAAAAAA AAAAAAAAAAAAAAAA | x |\n'
  const deps = (overrides: Record<string, unknown> = {}) => ({
    now: NOW,
    previousText: null,
    pauseMs: 0,
    fetchJplJson: (url: string) =>
      Promise.resolve(url.includes('scout') ? { data: [{ objectName: 'A1' }] } : CAD),
    fetchHorizonsText: (url: string) => {
      const p = new URL(url).searchParams
      const command = (p.get('COMMAND') ?? '').replace(/'|DES=|;/g, '')
      const start = Number((p.get('START_TIME') ?? '').replace(/'|JD/g, ''))
      const rows = Array.from(
        { length: 161 },
        (_, i) => `${String(start + i * 0.125)}, A.D. x, 1, 0.5, 0, 0, 0.017, 0,`,
      )
      const target = /^\d+$/.test(command) ? `${command} Zoozve` : `(${command})`
      return Promise.resolve(`Target body name: ${target}\n$$SOE\n${rows.join('\n')}\n$$EOE\n`)
    },
    fetchNeoccText: () => Promise.resolve(NEOCC_HEADER),
    ...overrides,
  })

  it('writes the finished body with its age and counts as KV metadata', async () => {
    const { entry, write } = await refreshOrreryNeo(null, deps())
    expect(entry.ok).toBe(true)
    expect(entry.detail).toMatch(/2 approaches/)
    expect(write.key).toBe(KEY_ORRERY_NEO)
    expect(write.metadata).toEqual({
      fetchedAt: new Date(NOW).toISOString(),
      approaches: 2,
      placed: 2,
      scout: 1,
      missing: 0,
    })
  })

  it('ships without Scout, as a warning naming it', async () => {
    const { entry, write } = await refreshOrreryNeo(
      null,
      deps({
        fetchJplJson: (url: string) =>
          url.includes('scout') ? Promise.reject(new Error('HTTP 503')) : Promise.resolve(CAD),
      }),
    )
    expect(entry.ok).toBe(true)
    expect(entry.warning).toBe(true)
    expect(entry.detail).toMatch(/missing jpl-scout/)
    expect(JSON.parse(write.value).scout).toBeNull()
  })

  it('judges a CAD failure by the age of the copy it would replace (36 h)', async () => {
    const failing = deps({ fetchJplJson: () => Promise.reject(new Error('HTTP 503')) })
    const young = JSON.stringify({ generatedAt: new Date(NOW - 10 * HOUR).toISOString() })
    const old = JSON.stringify({ generatedAt: new Date(NOW - 40 * HOUR).toISOString() })
    const a = await refreshOrreryNeo(null, { ...failing, previousText: young })
    expect(a.entry.ok).toBe(true)
    expect(a.write).toBeUndefined()
    const b = await refreshOrreryNeo(null, { ...failing, previousText: old })
    expect(b.entry.ok).toBe(false)
    expect(b.entry.detail).toMatch(/refresh:orrery-neo/)
  })
})

describe('refreshOrrerySmallBodies (#99)', () => {
  const NOW = Date.UTC(2026, 10, 7, 4)
  // 3I's real header (fixtures/smallbodies), renamed for whichever object is asked.
  const HEADER = readFileSync(
    join(__dirname, '..', 'fixtures', 'smallbodies', 'horizons-3i.txt'),
    'utf8',
  ).split('$$SOE')[0]
  const NAMES: Record<string, string> = {
    '50788063': "1I/'Oumuamua (A/2017 U1)",
    '1003639': 'Borisov (C/2019 Q4)',
    '1004083': 'ATLAS (C/2025 N1)',
  }
  const deps = (overrides: Record<string, unknown> = {}) => ({
    now: NOW,
    previousText: null,
    pauseMs: 0,
    // No comets today: SBDB is down. The interstellar objects still ship.
    fetchJplJson: () => Promise.reject(new Error('HTTP 503')),
    fetchHorizonsText: (url: string) => {
      const p = new URL(url).searchParams
      const spkid = /DES=(\d+);/.exec(p.get('COMMAND') ?? '')?.[1] ?? ''
      const start = Number((p.get('START_TIME') ?? '').replace(/'|JD/g, ''))
      const stop = Number((p.get('STOP_TIME') ?? '').replace(/'|JD/g, ''))
      const step = Number.parseFloat((p.get('STEP_SIZE') ?? '').replace(/'/g, ''))
      const n = Math.round((stop - start) / step) + 1
      const rows = Array.from(
        { length: n },
        (_, i) => `${String(start + i * step)}, A.D. x, 1, 0.5, 0, 0, 0.017, 0,`,
      )
      const head = (HEADER ?? '').replace(
        /^Target body name:.*$/m,
        `Target body name: ${NAMES[spkid] ?? '?'}   {source: JPL#1}`,
      )
      return Promise.resolve(`${head}$$SOE\n${rows.join('\n')}\n$$EOE\n`)
    },
    ...overrides,
  })

  it('writes the finished body with its counts as KV metadata, warning on what is missing', async () => {
    const { entry, write } = await refreshOrrerySmallBodies(null, deps())
    expect(entry.ok).toBe(true)
    expect(entry.warning).toBe(true)
    expect(entry.detail).toMatch(/0 comets, 3 interstellar/)
    expect(entry.detail).toMatch(/missing jpl-sbdb-query/)
    expect(entry.detail).toMatch(/0 asteroids/)
    expect(write.key).toBe(KEY_ORRERY_SMALLBODIES)
    expect(KEY_ORRERY_SMALLBODIES).toBe('horizons:smallbodies:v1')
    expect(write.metadata).toEqual({
      fetchedAt: new Date(NOW).toISOString(),
      comets: 0,
      interstellar: 3,
      placed: 3,
      // The comet query and the asteroid query.
      missing: 2,
    })
  })

  it("also writes the Tonight panel's slice, cut from the same body under its own key (#135)", async () => {
    const { write, tonightWrite } = await refreshOrrerySmallBodies(null, deps())
    expect(tonightWrite.key).toBe(KEY_COMETS_TONIGHT)
    expect(KEY_COMETS_TONIGHT).toBe('horizons:comets-tonight:v2')
    const tonight = JSON.parse(tonightWrite.value)
    const full = JSON.parse(write.value)
    expect(tonight.generatedAt).toBe(full.generatedAt)
    // Every body with a magnitude law (this stub gives all three 3I's header), in order.
    type Row = { id: string; m1: number | null; k1: number | null }
    const lawful = [...full.comets, ...full.interstellar]
      .filter((b: Row) => b.m1 !== null && b.k1 !== null)
      .map((b: Row) => b.id)
    expect(lawful.length).toBeGreaterThan(0)
    expect(tonight.comets.map((c: Row) => c.id)).toEqual(lawful)
    expect(tonightWrite.value.length).toBeLessThan(write.value.length / 4)
    expect(tonightWrite.metadata).toEqual({
      fetchedAt: new Date(NOW).toISOString(),
      comets: lawful.length,
      asteroids: 0,
    })
    expect(tonight.asteroids).toEqual([])
  })

  it('puts the bright asteroids in the slice only, and counts them in the detail (#99 item 4)', async () => {
    const sbdb = JSON.parse(
      readFileSync(join(__dirname, '..', 'fixtures', 'tonight', 'sbdb-asteroids.json'), 'utf8'),
    ) as { data: unknown[][] }
    const names = new Map(sbdb.data.map((r) => [String(r[2]), String(r[0]).trim()]))
    const base = deps()
    const withAsteroids = deps({
      fetchJplJson: (url: string) =>
        new URL(url).searchParams.get('sb-kind') === 'a'
          ? Promise.resolve(sbdb)
          : Promise.reject(new Error('HTTP 503')),
      fetchHorizonsText: (url: string) => {
        const spkid = /DES=(\d+);/.exec(new URL(url).searchParams.get('COMMAND') ?? '')?.[1] ?? ''
        const name = names.get(spkid)
        if (!name) return base.fetchHorizonsText(url)
        return base
          .fetchHorizonsText(url)
          .then((text: string) =>
            text.replace(/^Target body name:.*$/m, `Target body name: ${name}   {source: JPL#1}`),
          )
      },
    })
    const { entry, write, tonightWrite } = await refreshOrrerySmallBodies(null, withAsteroids)
    const tonight = JSON.parse(tonightWrite.value)
    expect(tonight.asteroids.length).toBeGreaterThan(0)
    expect(entry.detail).toMatch(new RegExp(`${String(tonight.asteroids.length)} asteroids`))
    expect(tonightWrite.metadata.asteroids).toBe(tonight.asteroids.length)
    expect(write.value).not.toContain('"asteroids"')
    expect(write.metadata).not.toHaveProperty('asteroids')
  })

  describe('a run that loses its asteroids (#99 item 4)', () => {
    const DAY_MS = 86_400_000
    const jdNow = NOW / DAY_MS + 2440587.5
    const rock = (coversDays: number) => ({
      id: 'sb:20000004',
      spkid: '20000004',
      name: '4 Vesta',
      h: 3.25,
      g: 0.32,
      gAssumed: false,
      elements: { epochJd: null, e: 0.09, q: 2.15, tp: 2458247.8, om: 103.8, w: 150.8, i: 7.14 },
      fine: {
        start: jdNow - 1,
        step: 1,
        samples: Array.from({ length: coversDays + 1 }, () => [2, 0, 0, 0, 0.01, 0]).flat(),
      },
    })
    /** The previous v2 slice as KV holds it. */
    const previousSlice = (coversDays: number) =>
      JSON.stringify({
        generatedAt: new Date(NOW - 6 * HOUR).toISOString(),
        comets: [],
        asteroids: [rock(coversDays)],
      })

    it("carries the previous slice's asteroids forward while their samples still cover tonight", async () => {
      const { tonightWrite, entry } = await refreshOrrerySmallBodies(null, {
        ...deps(),
        previousTonightText: previousSlice(7),
      })
      const tonight = JSON.parse(tonightWrite.value)
      expect(tonight.asteroids.map((a: { id: string }) => a.id)).toEqual(['sb:20000004'])
      expect(tonightWrite.metadata.asteroids).toBe(1)
      expect(entry.warning).toBe(true)
      expect(entry.detail).toMatch(/WARN.*1 asteroids? carried forward/)
    })

    it('writes the empty list when the previous samples no longer cover tonight', async () => {
      const { tonightWrite, entry } = await refreshOrrerySmallBodies(null, {
        ...deps(),
        previousTonightText: previousSlice(1),
      })
      expect(JSON.parse(tonightWrite.value).asteroids).toEqual([])
      expect(entry.detail).not.toMatch(/carried forward/)
    })

    it('writes the empty list when there is no previous slice, or it is not readable', async () => {
      for (const previousTonightText of [null, 'not json']) {
        const { tonightWrite } = await refreshOrrerySmallBodies(null, {
          ...deps(),
          previousTonightText,
        })
        expect(JSON.parse(tonightWrite.value).asteroids).toEqual([])
      }
    })

    it('replaces the previous asteroids when the run placed new ones', async () => {
      const sbdb = JSON.parse(
        readFileSync(join(__dirname, '..', 'fixtures', 'tonight', 'sbdb-asteroids.json'), 'utf8'),
      ) as { data: unknown[][] }
      const names = new Map(sbdb.data.map((r) => [String(r[2]), String(r[0]).trim()]))
      const base = deps()
      const fresh = deps({
        fetchJplJson: (url: string) =>
          new URL(url).searchParams.get('sb-kind') === 'a'
            ? Promise.resolve(sbdb)
            : Promise.reject(new Error('HTTP 503')),
        fetchHorizonsText: (url: string) => {
          const spkid = /DES=(\d+);/.exec(new URL(url).searchParams.get('COMMAND') ?? '')?.[1] ?? ''
          const name = names.get(spkid)
          if (!name) return base.fetchHorizonsText(url)
          return base
            .fetchHorizonsText(url)
            .then((t: string) =>
              t.replace(/^Target body name:.*$/m, `Target body name: ${name}   {source: JPL#1}`),
            )
        },
      })
      const { tonightWrite, entry } = await refreshOrrerySmallBodies(null, {
        ...fresh,
        previousTonightText: previousSlice(7),
      })
      const ids = JSON.parse(tonightWrite.value).asteroids.map((a: { id: string }) => a.id)
      expect(ids.length).toBeGreaterThan(1)
      expect(entry.detail).not.toMatch(/carried forward/)
    })
  })

  it('writes no slice when the step fails, so the last one ages with its source', async () => {
    const failing = deps({ fetchHorizonsText: () => Promise.reject(new Error('HTTP 503')) })
    const young = JSON.stringify({ generatedAt: new Date(NOW - 50 * HOUR).toISOString() })
    const res = await refreshOrrerySmallBodies(null, { ...failing, previousText: young })
    expect(res.tonightWrite).toBeUndefined()
  })

  it("reuses the last copy's long spans for a day", async () => {
    const first = await refreshOrrerySmallBodies(null, deps())
    let asked = 0
    const counting = deps()
    const second = await refreshOrrerySmallBodies(null, {
      ...counting,
      now: NOW + 6 * HOUR,
      previousText: first.write.value,
      fetchHorizonsText: (url: string) => {
        asked += 1
        return counting.fetchHorizonsText(url)
      },
    })
    expect(second.entry.ok).toBe(true)
    expect(asked).toBe(3)
  })

  it('judges a total failure by the age of the copy it would replace (72 h)', async () => {
    const failing = deps({ fetchHorizonsText: () => Promise.reject(new Error('HTTP 503')) })
    const young = JSON.stringify({ generatedAt: new Date(NOW - 50 * HOUR).toISOString() })
    const old = JSON.stringify({ generatedAt: new Date(NOW - 80 * HOUR).toISOString() })
    const a = await refreshOrrerySmallBodies(null, { ...failing, previousText: young })
    expect(a.entry.ok).toBe(true)
    expect(a.write).toBeUndefined()
    const b = await refreshOrrerySmallBodies(null, { ...failing, previousText: old })
    expect(b.entry.ok).toBe(false)
    expect(b.entry.detail).toMatch(/refresh:orrery-smallbodies/)
  })
})

describe('refreshOrreryDwarfs (#99 item 8)', () => {
  const NOW = Date.UTC(2026, 10, 12, 4)
  const HEADER = readFileSync(
    join(__dirname, '..', 'fixtures', 'smallbodies', 'horizons-3i.txt'),
    'utf8',
  ).split('$$SOE')[0]
  const deps = (overrides: Record<string, unknown> = {}) => ({
    now: NOW,
    previousText: null,
    pauseMs: 0,
    fetchHorizonsText: (url: string) => {
      const p = new URL(url).searchParams
      const start = Number((p.get('START_TIME') ?? '').replace(/'|JD/g, ''))
      const stop = Number((p.get('STOP_TIME') ?? '').replace(/'|JD/g, ''))
      const stepText = (p.get('STEP_SIZE') ?? '').replace(/'/g, '')
      // "1826 d", or "6 h" for Charon.
      const step = Number.parseFloat(stepText) / (stepText.endsWith(' h') ? 24 : 1)
      const n = Math.floor((stop - start) / step) + 1
      const rows = Array.from(
        { length: n },
        (_, i) => `${String(start + i * step)}, A.D. x, 40, 1, 0, 0, 0, 0,`,
      )
      const target =
        [...DWARFS, CHARON].find((d) => `'${d.command}'` === p.get('COMMAND'))?.target ?? '?'
      const head = (HEADER ?? '').replace(
        /^Target body name:.*$/m,
        `Target body name: ${target}   {source: JPL#1}`,
      )
      return Promise.resolve(`${head}$$SOE\n${rows.join('\n')}\n$$EOE\n`)
    },
    ...overrides,
  })

  it('writes its own key, apart from the comets, with its counts as KV metadata', async () => {
    const { entry, write } = await refreshOrreryDwarfs(null, deps())
    expect(entry.ok).toBe(true)
    expect(entry.warning).toBe(false)
    // The five, then Charon (#99).
    expect(entry.detail).toMatch(/refresh:orrery-dwarfs 5 dwarf planets, 6 JPL requests/)
    expect(KEY_ORRERY_DWARFS).toBe('horizons:dwarfs:v1')
    expect(KEY_ORRERY_DWARFS).not.toBe(KEY_ORRERY_SMALLBODIES)
    expect(write.key).toBe(KEY_ORRERY_DWARFS)
    expect(write.metadata).toEqual({
      fetchedAt: new Date(NOW).toISOString(),
      dwarfs: 5,
      missing: 0,
    })
  })

  it("reuses the last copy's spans for a day", async () => {
    const first = await refreshOrreryDwarfs(null, deps())
    let asked = 0
    const counting = deps()
    const second = await refreshOrreryDwarfs(null, {
      ...counting,
      now: NOW + 6 * HOUR,
      previousText: first.write.value,
      fetchHorizonsText: (url: string) => {
        asked += 1
        return counting.fetchHorizonsText(url)
      },
    })
    expect(second.entry.ok).toBe(true)
    expect(asked).toBe(0)
  })

  it('judges a total failure by the age of the copy it would replace (72 h)', async () => {
    const failing = deps({ fetchHorizonsText: () => Promise.reject(new Error('HTTP 503')) })
    const young = JSON.stringify({ generatedAt: new Date(NOW - 50 * HOUR).toISOString() })
    const old = JSON.stringify({ generatedAt: new Date(NOW - 80 * HOUR).toISOString() })
    const a = await refreshOrreryDwarfs(null, { ...failing, previousText: young })
    expect(a.entry.ok).toBe(true)
    expect(a.write).toBeUndefined()
    const b = await refreshOrreryDwarfs(null, { ...failing, previousText: old })
    expect(b.entry.ok).toBe(false)
    expect(b.entry.detail).toMatch(/refresh:orrery-dwarfs/)
  })
})

describe('refreshJplFeeds (#146)', () => {
  const NOW = Date.UTC(2026, 10, 12, 6, 17)
  const RESULT = `$$SOE
 2026-Nov-12 00:00     03 18 14.81 +17 47 39.4    1.333   4.226   34.5789 /L
$$EOE`
  const deps = (overrides: Record<string, unknown> = {}) => ({
    now: NOW,
    pauseMs: 0,
    previousTexts: { planets: null, sentry: null, fireball: null },
    fetchHorizonsText: () => Promise.resolve(RESULT),
    fetchJson: (url: string) =>
      Promise.resolve(
        url.includes('sentry')
          ? { count: '1', data: [{ des: '99942', ps_cum: '-2.7' }] }
          : {
              count: '1',
              fields: ['date', 'energy'],
              data: [['2026-11-10 01:02:03', '1.1']],
            },
      ),
    ...overrides,
  })

  it('writes three keys of their own, each with its age and counts as KV metadata', async () => {
    const { entries, writes } = await refreshJplFeeds(null, deps())
    expect(entries.map((e: { signature: string }) => e.signature)).toEqual([
      'refresh:planets',
      'refresh:sentry',
      'refresh:fireball',
    ])
    expect(entries.every((e: { ok: boolean }) => e.ok)).toBe(true)
    expect([KEY_PLANETS, KEY_SENTRY, KEY_FIREBALL]).toEqual([
      'horizons:planets:v1',
      'jpl:sentry:v1',
      'jpl:fireball:v1',
    ])
    const at = new Date(NOW).toISOString()
    expect(writes.map((w: { key: string }) => w.key)).toEqual([
      KEY_PLANETS,
      KEY_SENTRY,
      KEY_FIREBALL,
    ])
    expect(writes.map((w: { metadata: unknown }) => w.metadata)).toEqual([
      { fetchedAt: at, bodies: 9, missing: 0 },
      { fetchedAt: at, objects: 1 },
      { fetchedAt: at, events: 1 },
    ])
    expect(JSON.parse(writes[1].value).data[0].des).toBe('99942')
  })

  it('warns, and still writes, when some planets are missing', async () => {
    const { entries, writes } = await refreshJplFeeds(
      null,
      deps({
        fetchHorizonsText: (url: string) =>
          url.includes('COMMAND=599')
            ? Promise.reject(new Error('HTTP 503'))
            : Promise.resolve(RESULT),
      }),
    )
    expect(entries[0].ok).toBe(true)
    expect(entries[0].warning).toBe(true)
    expect(entries[0].detail).toMatch(/8 bodies.*WARN missing Jupiter/)
    expect(writes[0].metadata).toMatchObject({ bodies: 8, missing: 1 })
  })

  describe('a partial planets build against the copy already in KV', () => {
    const body = (name: string) => ({ name, raHours: 1, decDeg: 2, mag: 3, elongation: 4 })
    const NAMES = [
      'Sun',
      'Moon',
      'Mercury',
      'Venus',
      'Mars',
      'Jupiter',
      'Saturn',
      'Uranus',
      'Neptune',
    ]
    const copy = (hoursOld: number, names: string[] = NAMES) =>
      JSON.stringify({
        bodies: names.map(body),
        updatedAt: new Date(NOW - hoursOld * HOUR).toISOString(),
      })
    const noJupiter = (url: string) =>
      url.includes('COMMAND=599') ? Promise.reject(new Error('HTTP 503')) : Promise.resolve(RESULT)

    it('keeps a complete copy that is still inside 24 h, and says so', async () => {
      const { entries, writes } = await refreshJplFeeds(
        null,
        deps({
          fetchHorizonsText: noJupiter,
          previousTexts: { planets: copy(6), sentry: null, fireball: null },
        }),
      )
      expect(writes.map((w: { key: string }) => w.key)).not.toContain(KEY_PLANETS)
      expect(entries[0].ok).toBe(true)
      expect(entries[0].warning).toBe(true)
      expect(entries[0].detail).toMatch(/WARN missing Jupiter; kept the previous copy/)
    })

    it('writes the partial one when the previous copy is older than 24 h', async () => {
      const { writes } = await refreshJplFeeds(
        null,
        deps({
          fetchHorizonsText: noJupiter,
          previousTexts: { planets: copy(25), sentry: null, fireball: null },
        }),
      )
      expect(writes[0].key).toBe(KEY_PLANETS)
      expect(writes[0].metadata).toMatchObject({ bodies: 8, missing: 1 })
    })

    it('writes the partial one when there is no previous copy', async () => {
      const { writes } = await refreshJplFeeds(null, deps({ fetchHorizonsText: noJupiter }))
      expect(writes[0].key).toBe(KEY_PLANETS)
    })

    it('writes a partial one over an equally partial or smaller copy', async () => {
      const { writes } = await refreshJplFeeds(
        null,
        deps({
          fetchHorizonsText: noJupiter,
          previousTexts: { planets: copy(6, NAMES.slice(0, 8)), sentry: null, fireball: null },
        }),
      )
      expect(writes[0].key).toBe(KEY_PLANETS)
    })

    it('replaces a full copy with a full one', async () => {
      const { entries, writes } = await refreshJplFeeds(
        null,
        deps({ previousTexts: { planets: copy(6), sentry: null, fireball: null } }),
      )
      expect(writes[0].key).toBe(KEY_PLANETS)
      expect(entries[0].warning).toBe(false)
    })
  })

  it('judges each failed feed by the age of its own KV copy (24 h, 48 h, 48 h)', async () => {
    const copy = (hoursOld: number) =>
      JSON.stringify({ updatedAt: new Date(NOW - hoursOld * HOUR).toISOString() })
    const down = () => Promise.reject(new Error('HTTP 503'))
    const young = await refreshJplFeeds(
      null,
      deps({
        fetchHorizonsText: down,
        fetchJson: down,
        previousTexts: { planets: copy(20), sentry: copy(40), fireball: copy(40) },
      }),
    )
    expect(young.writes).toEqual([])
    expect(young.entries.map((e: { ok: boolean }) => e.ok)).toEqual([true, true, true])
    const old = await refreshJplFeeds(
      null,
      deps({
        fetchHorizonsText: down,
        fetchJson: down,
        previousTexts: { planets: copy(26), sentry: copy(50), fireball: copy(40) },
      }),
    )
    expect(old.entries.map((e: { ok: boolean }) => e.ok)).toEqual([false, false, true])
    expect(old.entries[0].detail).toMatch(/^refresh:planets FAIL/)
  })

  it('pages at once when there is no copy to fall back on', async () => {
    const down = () => Promise.reject(new Error('HTTP 503'))
    const { entries } = await refreshJplFeeds(null, deps({ fetchJson: down }))
    expect(entries.map((e: { ok: boolean }) => e.ok)).toEqual([true, false, false])
  })
})
