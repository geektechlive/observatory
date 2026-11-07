/**
 * The refresh job's comets and interstellar objects (#99): one SBDB Query, then one
 * Horizons request per comet and two per interstellar object, all JPL, so the fake
 * refuses overlap the way Horizons does (#88). Headers are real answers
 * (tests/unit/fixtures/smallbodies, fetched 2026-11-07); the data rows are generated
 * over whatever span was asked.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { OrrerySmallBodiesSchema } from '@/schemas/orrerySmallBodies'

import {
  buildOrrerySmallBodies,
  earthHeliocentric,
  // @ts-expect-error plain ESM script, no type declarations
} from '../../../scripts/orrery-smallbodies.mjs'

const fixture = (name: string) =>
  readFileSync(join(__dirname, '..', 'fixtures', 'smallbodies', name), 'utf8')

const NOW = Date.UTC(2026, 10, 7, 4)
const DAY_MS = 86_400_000
const jdOf = (ms: number) => ms / DAY_MS + 2440587.5

const HEADERS: Record<string, string> = {
  '50788063': 'horizons-1i.txt',
  '1003639': 'horizons-2i.txt',
  '1004083': 'horizons-3i.txt',
}

/** A Horizons answer: a real header, with rows over the asked span and target renamed. */
function horizonsAnswer(url: URL, rename?: string) {
  const strip = (v: string | null) => (v ?? '').replace(/^'|'$/g, '')
  const command = strip(url.searchParams.get('COMMAND'))
  const spkid = /^DES=(\d+);/.exec(command)?.[1] ?? ''
  const start = Number(strip(url.searchParams.get('START_TIME')).replace(/^JD/, ''))
  const stop = Number(strip(url.searchParams.get('STOP_TIME')).replace(/^JD/, ''))
  const stepText = strip(url.searchParams.get('STEP_SIZE'))
  const step = stepText.endsWith(' d')
    ? Number(stepText.slice(0, -2))
    : Number(stepText.slice(0, -2)) / 24
  const n = Math.round((stop - start) / step) + 1
  const rows = Array.from({ length: n }, (_, i) => {
    const jd = start + i * step
    return `${String(jd)}, A.D. x, ${String(2 + i * 1e-3)}, 0.4, 0.001, -0.01, 0.016, 0.0001,`
  })
  const header = fixture(HEADERS[spkid] ?? 'horizons-24p.txt')
  const [head = ''] = header.split('$$SOE')
  // Comets borrow 24P's header; name the target after the comet asked for.
  const named =
    rename ?? (HEADERS[spkid] ? null : (COMET_TARGETS.get(spkid) ?? 'Somebody (C/1900 A1)'))
  const withTarget = named
    ? head.replace(/^Target body name:.*$/m, `Target body name: ${named}   {source: JPL#1}`)
    : head
  return `${withTarget}$$SOE\n${rows.join('\n')}\n$$EOE\n`
}

/** The comets' target names, as Horizons writes them, by SPK-ID (from the SBDB fixture). */
const COMET_TARGETS = new Map<string, string>(
  (JSON.parse(fixture('sbdb-comets.json')) as { data: unknown[][] }).data.map((r) => {
    const pdes = String(r[1])
    const des = /^\d+[PDI]$/.test(pdes) ? pdes : `${String(r[3])}/${pdes}`
    return [String(r[2]), /^\d+[PDI]$/.test(des) ? `${des}/Somebody` : `Somebody (${des})`]
  }),
)

interface FakeOptions {
  horizons?: (url: URL) => string
  sbdb?: () => unknown
}

function fake(opts: FakeOptions = {}) {
  const calls: string[] = []
  let inFlight = 0
  const jpl = async (raw: string): Promise<string> => {
    inFlight += 1
    try {
      if (inFlight > 1) throw new Error('HTTP 503 (overlapping JPL request)')
      await new Promise((r) => setTimeout(r, 1))
      const url = new URL(raw)
      if (url.pathname === '/sbdb_query.api') {
        calls.push('sbdb')
        return JSON.stringify(opts.sbdb ? opts.sbdb() : JSON.parse(fixture('sbdb-comets.json')))
      }
      if (url.pathname === '/api/horizons.api') {
        calls.push(
          `horizons:${url.searchParams.get('COMMAND') ?? ''}:${url.searchParams.get('STEP_SIZE') ?? ''}`,
        )
        return (opts.horizons ?? horizonsAnswer)(url)
      }
      throw new Error(`unexpected JPL url ${raw}`)
    } finally {
      inFlight -= 1
    }
  }
  return {
    calls,
    deps: {
      now: NOW,
      fetchJplJson: async (url: string) => JSON.parse(await jpl(url)) as unknown,
      fetchHorizonsText: jpl,
      pauseMs: 0,
    },
  }
}

describe('buildOrrerySmallBodies', () => {
  it('builds a payload the schema accepts, one JPL request at a time', async () => {
    const { deps, calls } = fake()
    const { payload, requests } = await buildOrrerySmallBodies(deps)
    expect(OrrerySmallBodiesSchema.parse(payload)).toBeTruthy()
    expect(calls[0]).toBe('sbdb')
    // SBDB, twelve comets, then each interstellar object's fine and long spans.
    expect(requests).toBe(1 + 12 + 3 * 2)
    expect(payload.comets).toHaveLength(12)
    expect(payload.interstellar.map((o: { name: string }) => o.name)).toEqual([
      '1I/ʻOumuamua',
      '2I/Borisov',
      '3I/ATLAS',
    ])
    expect(payload.missing).toEqual([])
  })

  it('asks comets by SPK-ID with CAP;NOFRAG and 1I bare', async () => {
    const { deps, calls } = fake()
    await buildOrrerySmallBodies(deps)
    expect(calls.some((c) => c.startsWith("horizons:'DES=50788063;'"))).toBe(true)
    expect(calls.some((c) => c.startsWith("horizons:'DES=1003639;CAP;NOFRAG'"))).toBe(true)
    const cometCalls = calls.filter(
      (c) => c.includes('CAP;NOFRAG') && !c.includes('1003639') && !c.includes('1004083'),
    )
    expect(cometCalls).toHaveLength(12)
  })

  it('samples now ±30 days daily with velocity, brightest comet first', async () => {
    const { deps } = fake()
    const { payload } = await buildOrrerySmallBodies(deps)
    const first = payload.comets[0]
    expect(first.name).toBe('C/2024 T5 (ATLAS)')
    // JPL's forecast for 2026-11-07 from SBDB's M1 and K1, to one decimal.
    expect(first.magnitude).toBe(13.3)
    expect(first.fine.step).toBe(1)
    expect(first.fine.samples).toHaveLength(61 * 6)
    expect(first.fine.start).toBe(jdOf(Date.UTC(2026, 9, 8)))
    expect(first.coarse).toBeNull()
    // SBDB gives it e = 1.0022, yet it is no visitor: v∞ is kept for 1I-3I only.
    expect(first.vInfKms).toBeNull()
    expect(first.elementsSource).toBe('horizons')
    expect(first.solution.dataArc).toEqual({ from: '2000-10-07', to: '2026-06-20' })
  })

  it("gives each interstellar object its long path, its elements, v∞ and Horizons' arc", async () => {
    const { deps } = fake()
    const { payload } = await buildOrrerySmallBodies(deps)
    const [oumuamua, borisov, atlas] = payload.interstellar
    expect(atlas.elements.e).toBeCloseTo(6.1235, 4)
    expect(atlas.vInfKms).toBeCloseTo(58, 0)
    expect(atlas.discovered).toBe('2025-07-01')
    expect(atlas.interstellar).toBe(true)
    expect(atlas.solution).toMatchObject({
      ref: 'JPL#55',
      dataArc: { from: '2025-10-03', to: '2026-10-16' },
    })
    expect(oumuamua.kind).toBe('asteroid')
    expect(oumuamua.h).toBe(22.08)
    expect(oumuamua.vInfKms).toBeCloseTo(26.3, 0)
    // From three years before perihelion (2017-09-09) to five years ahead.
    expect(oumuamua.coarse.start).toBeLessThan(jdOf(Date.UTC(2014, 8, 10)) + 5)
    expect(oumuamua.coarse.start).toBeGreaterThan(jdOf(Date.UTC(2014, 8, 9)) - 5)
    const coarse = oumuamua.coarse as { start: number; step: number; samples: number[] }
    const end = coarse.start + (coarse.samples.length / 3 - 1) * coarse.step
    expect(end).toBeGreaterThan(jdOf(NOW + 5 * 365 * DAY_MS) - 10)
    expect(oumuamua.coarse.step).toBeLessThanOrEqual(5)
    expect(borisov.coarse.step).toBeLessThanOrEqual(10)
  })

  it('reuses the long spans for a day, so a run asks only for the fine ones', async () => {
    const first = fake()
    const { payload: previous } = await buildOrrerySmallBodies(first.deps)
    const { deps } = fake()
    const later = await buildOrrerySmallBodies({ ...deps, now: NOW + 6 * 3_600_000, previous })
    expect(later.requests).toBe(1 + 12 + 3)
    expect(later.payload.interstellar[0].coarse).toEqual(previous.interstellar[0].coarse)
    expect(later.payload.coarseFetchedAt).toBe(previous.coarseFetchedAt)
    const dayLater = await buildOrrerySmallBodies({ ...deps, now: NOW + 25 * 3_600_000, previous })
    expect(dayLater.requests).toBe(1 + 12 + 3 * 2)
  })

  it("refuses an answer for the wrong object, keeping SBDB's elements", async () => {
    const { deps } = fake({
      horizons: (url) =>
        (url.searchParams.get('COMMAND') ?? '').includes('1004035')
          ? horizonsAnswer(url, 'ATLAS (C/2024 T50)')
          : horizonsAnswer(url),
    })
    const { payload } = await buildOrrerySmallBodies(deps)
    const t5 = payload.comets.find((c: { spkid: string }) => c.spkid === '1004035')
    expect(t5).toBeDefined()
    expect(t5.fine).toBeNull()
    expect(t5.elementsSource).toBe('sbdb')
    expect(payload.missing).toContainEqual({
      id: 'sb:1004035',
      reason: expect.stringMatching(/T50/),
    })
  })

  it('still ships the interstellar objects when SBDB Query fails', async () => {
    const { deps } = fake({ sbdb: () => ({ message: 'down' }) })
    const { payload } = await buildOrrerySmallBodies(deps)
    expect(payload.comets).toEqual([])
    expect(payload.interstellar).toHaveLength(3)
    expect(payload.missing.map((m: { id: string }) => m.id)).toContain('jpl-sbdb-query')
  })

  it('fails outright when no object could be placed at all', async () => {
    const { deps } = fake({ sbdb: () => ({ message: 'down' }), horizons: () => 'API down' })
    await expect(buildOrrerySmallBodies(deps)).rejects.toThrow(/no comet or interstellar/)
  })

  it('stops at the time budget and lists what it did not reach', async () => {
    const { deps } = fake()
    let t = 0
    const { payload } = await buildOrrerySmallBodies({
      ...deps,
      budgetMs: 4,
      clock: () => (t += 1),
    })
    expect(payload.missing).toContainEqual({
      id: expect.stringMatching(/^sb:/),
      reason: 'time budget spent',
    })
  })
})

describe('earthHeliocentric', () => {
  it("puts Earth about 1 au out, on the Sun's far side from where the Sun appears in November", () => {
    const p = earthHeliocentric(jdOf(NOW))
    expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(0.99, 1)
    // In early November the Sun is near ecliptic longitude 225°, so Earth is near 45°.
    const lon = ((Math.atan2(p.y, p.x) * 180) / Math.PI + 360) % 360
    expect(Math.abs(lon - 45)).toBeLessThan(2)
  })
})
