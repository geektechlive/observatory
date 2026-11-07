/**
 * The refresh job's Horizons step for the orrery (#93). Horizons is faked from real
 * fixtures (tests/unit/fixtures/horizons, fetched 2026-11-06). The fake refuses
 * overlapping requests the way Horizons does (#88), so a parallel call fails the test.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { OrreryBodiesSchema } from '@/schemas/orreryBodies'

import {
  buildOrreryBodies,
  horizonsUrl,
  stepSize,
  // @ts-expect-error plain ESM script, no type declarations
} from '../../../scripts/orrery-bodies.mjs'

const fixture = (name: string) =>
  readFileSync(join(__dirname, '..', 'fixtures', 'horizons', `${name}.txt`), 'utf8')

const NOW = Date.UTC(2026, 10, 6, 12)
const DAY = 86_400_000

/** A Horizons CSV answer with `n` uniform samples from `startJd`, for any target. */
function synthetic(naifId: string, startJd: number, stepDays: number, n: number, extra = '') {
  const rows = Array.from({ length: n }, (_, i) => {
    const jd = startJd + i * stepDays
    return `${String(jd)}, A.D. x, ${String(1 + i * 1e-3)}, 0.5, 0.01, -0.01, 0.017, 0.0001,`
  })
  return `${extra}Target body name: Thing (${naifId})   {source: test}\n$$SOE\n${rows.join('\n')}\n$$EOE\n`
}

interface Call {
  command: string
  start: string
  stop: string
  step: string
}

/** A fake Horizons: answers per COMMAND, refuses overlap, records every call. */
function fakeHorizons(answer: (call: Call) => string) {
  const calls: Call[] = []
  let inFlight = 0
  const fetchText = async (url: string): Promise<string> => {
    inFlight += 1
    try {
      if (inFlight > 1) throw new Error('HTTP 503 (overlapping Horizons request)')
      await new Promise((r) => setTimeout(r, 1))
      const p = new URL(url).searchParams
      const strip = (v: string | null) => (v ?? '').replace(/^'|'$/g, '')
      const call = {
        command: strip(p.get('COMMAND')),
        start: strip(p.get('START_TIME')),
        stop: strip(p.get('STOP_TIME')),
        step: strip(p.get('STEP_SIZE')),
      }
      calls.push(call)
      return answer(call)
    } finally {
      inFlight -= 1
    }
  }
  return { calls, fetchText }
}

const jdOf = (s: string) => Number(s.replace(/^JD\s*/, ''))
const stepDays = (s: string) =>
  s.endsWith(' h') ? Number(s.slice(0, -2)) / 24 : Number(s.slice(0, -2))

/** Answers any request with uniform synthetic samples over exactly the asked span. */
function anySpan(call: Call) {
  const start = jdOf(call.start)
  const step = stepDays(call.step)
  const n = Math.round((jdOf(call.stop) - start) / step) + 1
  return synthetic(call.command, start, step, n)
}

describe('stepSize and horizonsUrl', () => {
  it('writes Horizons step sizes', () => {
    expect(stepSize(1)).toBe('1 d')
    expect(stepSize(0.5)).toBe('12 h')
    expect(stepSize(30)).toBe('30 d')
  })

  it('asks for heliocentric ecliptic J2000 vectors, position and velocity, as CSV', () => {
    const url = new URL(horizonsUrl('-31', 2461349.5, 2461351.5, 1))
    const p = url.searchParams
    expect(url.origin + url.pathname).toBe('https://ssd.jpl.nasa.gov/api/horizons.api')
    expect(p.get('COMMAND')).toBe("'-31'")
    expect(p.get('EPHEM_TYPE')).toBe('VECTORS')
    expect(p.get('CENTER')).toBe("'500@10'")
    expect(p.get('REF_PLANE')).toBe('ECLIPTIC')
    expect(p.get('OUT_UNITS')).toBe('AU-D')
    expect(p.get('VEC_TABLE')).toBe('2')
    expect(p.get('CSV_FORMAT')).toBe('YES')
    expect(p.get('START_TIME')).toBe("'JD2461349.5'")
    expect(p.get('STEP_SIZE')).toBe("'1 d'")
  })
})

describe('buildOrreryBodies', () => {
  it('fetches every body one request at a time and returns a schema-valid payload', async () => {
    const h = fakeHorizons(anySpan)
    const { payload } = await buildOrreryBodies({ now: NOW, fetchText: h.fetchText, pauseMs: 0 })
    const parsed = OrreryBodiesSchema.parse(payload)
    expect(parsed.bodies.map((b) => b.naifId)).toContain('-31')
    expect(parsed.bodies.map((b) => b.naifId)).toContain('399')
    expect(parsed.missing).toEqual([])
    // Earth and the Moon get a fine span only; craft also a whole-mission span.
    const earth = parsed.bodies.find((b) => b.naifId === '399')
    expect(earth?.fine?.step).toBe(1)
    expect(earth?.coarse).toBeNull()
    const v1 = parsed.bodies.find((b) => b.naifId === '-31')
    expect(v1?.coarse?.samples.length).toBeGreaterThan(100)
    // Coarse spans keep positions only: three numbers per sample.
    expect((v1?.coarse?.samples.length ?? 0) % 3).toBe(0)
    // Parker's fine span is every 12 h, and its whole-mission span every 3 days: at the
    // default ~25 days its 88-day orbit drew as a jagged polygon.
    const parker = parsed.bodies.find((b) => b.naifId === '-96')
    expect(parker?.fine?.step).toBe(0.5)
    expect(parker?.coarse?.step).toBe(3)
  })

  it('spans the fine window 30 days either side of now, on whole days', async () => {
    const h = fakeHorizons(anySpan)
    await buildOrreryBodies({ now: NOW, fetchText: h.fetchText, pauseMs: 0 })
    const earthCall = h.calls.find((c) => c.command === '399')
    const start = jdOf(earthCall?.start ?? '')
    expect(start % 1).toBe(0.5) // midnight UTC
    expect(jdOf(earthCall?.stop ?? '') - start).toBe(60)
  })

  it('clamps to where the ephemeris ends and asks again ("No ephemeris ... after")', async () => {
    const soho = fixture('soho-after')
    const h = fakeHorizons((call) => {
      // SOHO's ephemeris ends 2026-12-14 23:51 TDB, JD 2461388.49.
      if (call.command === '-21' && jdOf(call.stop) > 2461388.49) return soho
      return anySpan(call)
    })
    const { payload } = await buildOrreryBodies({ now: NOW, fetchText: h.fetchText, pauseMs: 0 })
    const s = OrreryBodiesSchema.parse(payload).bodies.find((b) => b.naifId === '-21')
    expect(s?.availableTo).toBe('2026-12-14T23:51:09.183Z')
    expect(s?.observedUntil).toBe('2026-10-05')
    // The whole-mission span (asked to run 5 years past now) stops at the limit.
    const coarse = s?.coarse ?? { start: 0, step: 1, samples: [] }
    const lastCoarseJd = coarse.start + (coarse.samples.length / 3 - 1) * coarse.step
    expect(lastCoarseJd).toBeLessThanOrEqual(2461388.49)
    expect(lastCoarseJd).toBeGreaterThan(2461388.49 - coarse.step)
  })

  it('records an object Horizons cannot serve as missing, and keeps the rest', async () => {
    const h = fakeHorizons((call) => {
      if (call.command === '-49') return 'Something went wrong, no $$SOE here'
      return anySpan(call)
    })
    const { payload } = await buildOrreryBodies({ now: NOW, fetchText: h.fetchText, pauseMs: 0 })
    expect(payload.missing.map((m: { id: string }) => m.id)).toEqual(['naif:-49'])
    expect(payload.bodies.some((b: { naifId: string }) => b.naifId === '-49')).toBe(false)
    expect(payload.bodies.length).toBeGreaterThan(10)
  })

  it('rejects an answer for the wrong target rather than mislabelling it', async () => {
    const h = fakeHorizons((call) =>
      call.command === '-32' ? synthetic('-31', jdOf(call.start), 1, 3) : anySpan(call),
    )
    const { payload } = await buildOrreryBodies({ now: NOW, fetchText: h.fetchText, pauseMs: 0 })
    expect(payload.missing.find((m: { id: string }) => m.id === 'naif:-32')?.reason).toMatch(
      /target/,
    )
  })

  it('reuses a whole-mission span younger than a day instead of refetching it', async () => {
    const first = fakeHorizons(anySpan)
    const { payload: previous } = await buildOrreryBodies({
      now: NOW,
      fetchText: first.fetchText,
      pauseMs: 0,
    })
    const second = fakeHorizons(anySpan)
    const { payload } = await buildOrreryBodies({
      now: NOW + 6 * 3_600_000,
      fetchText: second.fetchText,
      pauseMs: 0,
      previous,
    })
    // Only the fine spans were asked for: one call per body.
    expect(second.calls).toHaveLength(payload.bodies.length)
    expect(payload.coarseFetchedAt).toBe(previous.coarseFetchedAt)
    const v1 = payload.bodies.find((b: { naifId: string }) => b.naifId === '-31')
    expect(v1.coarse.samples.length).toBeGreaterThan(100)
  })

  it('refetches the whole-mission spans once they are a day old', async () => {
    const first = fakeHorizons(anySpan)
    const { payload: previous } = await buildOrreryBodies({
      now: NOW,
      fetchText: first.fetchText,
      pauseMs: 0,
    })
    const second = fakeHorizons(anySpan)
    await buildOrreryBodies({
      now: NOW + DAY + 1,
      fetchText: second.fetchText,
      pauseMs: 0,
      previous,
    })
    expect(second.calls.length).toBeGreaterThan(previous.bodies.length)
  })

  it('stops at its time budget and marks the rest missing', async () => {
    let t = NOW
    const h = fakeHorizons((call) => {
      t += 60_000 // every request "takes" a minute
      return anySpan(call)
    })
    const { payload } = await buildOrreryBodies({
      now: NOW,
      fetchText: h.fetchText,
      pauseMs: 0,
      budgetMs: 5 * 60_000,
      clock: () => t,
    })
    expect(payload.missing.length).toBeGreaterThan(0)
    expect(payload.missing.every((m: { reason: string }) => /budget/.test(m.reason))).toBe(true)
  })

  it('keeps the payload small: positions to 1e-8 au (1.5 km)', async () => {
    const h = fakeHorizons(() => fixture('voyager1'))
    const { payload } = await buildOrreryBodies({
      now: Date.UTC(2026, 10, 5),
      fetchText: h.fetchText,
      pauseMs: 0,
      only: ['-31'],
    })
    const x = payload.bodies[0]?.fine?.samples[0] as number
    expect(String(x).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(8)
  })
})
