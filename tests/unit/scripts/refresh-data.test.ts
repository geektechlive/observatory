import { describe, expect, it, vi } from 'vitest'

import {
  classifyFailure,
  describePayload,
  fetchWithRetry,
  isValidLaunchesPayload,
  KEY_ORRERY_BODIES,
  kvPutInit,
  parseTle,
  refreshOrreryBodies,
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
