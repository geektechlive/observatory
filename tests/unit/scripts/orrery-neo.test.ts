/**
 * The refresh job's close-approach step for the orrery (#92): JPL CAD, its PHA filter,
 * Scout and one Horizons request per asteroid, all JPL, so the fake refuses overlap the
 * way Horizons does (#88); and ESA NEOCC's flat files. Answers are real fixtures
 * (tests/unit/fixtures/neo, fetched 2026-11-07) or synthetic spans for Horizons.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { OrreryNeoSchema } from '@/schemas/orreryNeo'

import {
  buildOrreryNeo,
  cadUrl,
  // @ts-expect-error plain ESM script, no type declarations
} from '../../../scripts/orrery-neo.mjs'

const neo = (name: string) => readFileSync(join(__dirname, '..', 'fixtures', 'neo', name), 'utf8')

const NOW = Date.UTC(2026, 10, 7, 4)

/** A Horizons CSV answer over the asked span, naming the object as Horizons would. */
function horizonsAnswer(url: URL) {
  const strip = (v: string | null) => (v ?? '').replace(/^'|'$/g, '')
  const command = strip(url.searchParams.get('COMMAND'))
  const start = Number(strip(url.searchParams.get('START_TIME')).replace(/^JD/, ''))
  const stop = Number(strip(url.searchParams.get('STOP_TIME')).replace(/^JD/, ''))
  const step = 0.125
  const des = command.replace(/^DES=/, '').replace(/;$/, '')
  const target = /^\d+$/.test(des) ? `${des} Somebody (2002 VE68)` : `(${des})`
  const n = Math.round((stop - start) / step) + 1
  const rows = Array.from({ length: n }, (_, i) => {
    const jd = start + i * step
    return `${String(jd)}, A.D. x, ${String(0.9 + i * 1e-4)}, 0.4, 0.001, -0.01, 0.016, 0.0001,`
  })
  return `Target body name: ${target}   {source: JPL#1}\n$$SOE\n${rows.join('\n')}\n$$EOE\n`
}

interface FakeOptions {
  horizons?: (url: URL) => string
  scout?: () => unknown
  neocc?: (file: string) => string
}

/** Fake JPL plus NEOCC. JPL refuses overlapping requests and records the order. */
function fake(opts: FakeOptions = {}) {
  const jplCalls: string[] = []
  let inFlight = 0
  const jpl = async (raw: string): Promise<string> => {
    inFlight += 1
    try {
      if (inFlight > 1) throw new Error('HTTP 503 (overlapping JPL request)')
      await new Promise((r) => setTimeout(r, 1))
      const url = new URL(raw)
      if (url.hostname === 'ssd-api.jpl.nasa.gov' && url.pathname === '/cad.api') {
        jplCalls.push(url.searchParams.get('pha') === 'true' ? 'cad-pha' : 'cad')
        return url.searchParams.get('pha') === 'true' ? neo('cad-pha.json') : neo('cad.json')
      }
      if (url.pathname === '/scout.api') {
        jplCalls.push('scout')
        return JSON.stringify(opts.scout ? opts.scout() : JSON.parse(neo('scout.json')))
      }
      if (url.pathname === '/api/horizons.api') {
        jplCalls.push(`horizons:${url.searchParams.get('COMMAND') ?? ''}`)
        return (opts.horizons ?? horizonsAnswer)(url)
      }
      throw new Error(`unexpected JPL url ${raw}`)
    } finally {
      inFlight -= 1
    }
  }
  const neoccText = (raw: string) => {
    const file = new URL(raw).searchParams.get('file') ?? ''
    return Promise.resolve(opts.neocc ? opts.neocc(file) : neo(`${file}.txt`))
  }
  return {
    jplCalls,
    deps: {
      now: NOW,
      fetchJplJson: async (url: string) => JSON.parse(await jpl(url)) as unknown,
      fetchHorizonsText: jpl,
      fetchNeoccText: neoccText,
      pauseMs: 0,
    },
  }
}

describe('cadUrl', () => {
  it('asks for 0.05 au over ±30 days (#136), with names and the PHA filter when asked', () => {
    const url = new URL(cadUrl(NOW, false))
    expect(url.origin + url.pathname).toBe('https://ssd-api.jpl.nasa.gov/cad.api')
    expect(url.searchParams.get('date-min')).toBe('2026-10-08')
    expect(url.searchParams.get('date-max')).toBe('2026-12-07')
    expect(url.searchParams.get('dist-max')).toBe('0.05')
    expect(url.searchParams.get('fullname')).toBe('true')
    expect(url.searchParams.get('pha')).toBeNull()
    expect(new URL(cadUrl(NOW, true)).searchParams.get('pha')).toBe('true')
  })
})

describe('buildOrreryNeo', () => {
  it('builds a payload the schema accepts, one JPL request at a time', async () => {
    const { deps, jplCalls } = fake()
    const { payload, requests } = await buildOrreryNeo(deps)
    expect(OrreryNeoSchema.parse(payload)).toBeTruthy()
    // CAD, its PHA filter, Scout, then one Horizons request per selected object.
    expect(jplCalls.slice(0, 3)).toEqual(['cad', 'cad-pha', 'scout'])
    expect(requests).toBe(3 + 6)
    expect(payload.approaches).toHaveLength(6)
  })

  it('routes numbered and provisional objects differently, and marks the PHA', async () => {
    const { deps, jplCalls } = fake()
    const { payload } = await buildOrreryNeo(deps)
    expect(jplCalls).toContain("horizons:'524522;'")
    expect(jplCalls).toContain("horizons:'DES=2026 UE2;'")
    expect(payload.approaches[0]).toMatchObject({ des: '524522', pha: true, id: 'sb:524522' })
    expect(payload.approaches[0].target).toBe('524522 Somebody (2002 VE68)')
  })

  it('asks Horizons for ±30 days at 3 h, keeping a daily span plus 3 h around the pass (#136)', async () => {
    const asked: URL[] = []
    const { deps } = fake({
      horizons: (url) => {
        asked.push(url)
        return horizonsAnswer(url)
      },
    })
    const { payload } = await buildOrreryNeo(deps)
    expect(asked[0]?.searchParams.get('STEP_SIZE')).toBe("'3 h'")
    const parsed = OrreryNeoSchema.parse(payload)
    const a = parsed.approaches[0]
    if (!a?.fine || !a.close) throw new Error('expected both spans')
    expect(a.fine.step).toBe(1)
    expect(a.fine.samples).toHaveLength(61 * 6)
    expect(a.close.step).toBe(0.125)
    expect(a.close.start).toBeGreaterThanOrEqual(a.closeApproach.jd - 3)
    expect(a.close.start + (a.close.samples.length / 6 - 1) * 0.125).toBeLessThanOrEqual(
      a.closeApproach.jd + 3,
    )
    expect(a.close.samples.length / 6).toBeGreaterThanOrEqual(47)
    expect(parsed.window).toEqual({ from: '2026-10-08', to: '2026-12-07' })
  })

  it('keeps this week’s objects when the month holds more than the limit (#136)', async () => {
    const { deps } = fake()
    const { payload } = await buildOrreryNeo({ ...deps, limit: 3, nearLimit: 2 })
    expect(payload.approaches).toHaveLength(3)
  })

  it('refuses an answer for the wrong object and lists it as missing', async () => {
    const { deps } = fake({
      horizons: (url) =>
        url.searchParams.get('COMMAND') === "'524522;'"
          ? horizonsAnswer(new URL(url.toString().replace('524522', '248370')))
          : horizonsAnswer(url),
    })
    const { payload } = await buildOrreryNeo(deps)
    const zoozve = payload.approaches.find((a: { des: string }) => a.des === '524522')
    expect(zoozve.fine).toBeNull()
    expect(payload.missing).toContainEqual({
      id: 'sb:524522',
      reason: expect.stringMatching(/248370/),
    })
  })

  it('keeps going without Scout or NEOCC, saying which source is missing', async () => {
    const { deps } = fake({
      scout: () => ({ message: 'down' }),
      neocc: () => '<html>maintenance</html>',
    })
    const { payload } = await buildOrreryNeo(deps)
    expect(payload.scout).toBeNull()
    expect(payload.esa.riskList).toBeNull()
    expect(payload.esa.closeApproaches).toBeNull()
    expect(payload.missing.map((m: { id: string }) => m.id)).toEqual(
      expect.arrayContaining(['jpl-scout', 'esa-risk-list', 'esa-close-approaches']),
    )
    expect(payload.approaches).toHaveLength(6)
  })

  it('flags an approach that is on ESA’s risk list', async () => {
    const risk = `${neo('esa_risk_list.txt').trimEnd()}\n2026UE2                       |    5 |    *    | 2090-01-01 00:00 |  1.00E-7 |  -7.00 |  0 |   10.00  | 2090-2090 |  1.00E-7 |  -7.00 |\n`
    const { deps } = fake({
      neocc: (file) => (file === 'esa_risk_list' ? risk : neo(`${file}.txt`)),
    })
    const { payload } = await buildOrreryNeo(deps)
    const ue2 = payload.approaches.find((a: { des: string }) => a.des === '2026 UE2')
    expect(ue2.riskListed).toBe(true)
    expect(payload.approaches.filter((a: { riskListed: boolean }) => a.riskListed)).toHaveLength(1)
    expect(payload.esa.riskList.entries.some((e: { key: string }) => e.key === '2026 UE2')).toBe(
      true,
    )
  })

  it('fails outright when CAD itself fails: without it there is nothing to place', async () => {
    const { deps } = fake()
    await expect(
      buildOrreryNeo({ ...deps, fetchJplJson: () => Promise.reject(new Error('HTTP 503')) }),
    ).rejects.toThrow(/CAD/)
  })

  it('stops at the time budget and lists the objects it did not reach', async () => {
    const { deps } = fake()
    let t = 0
    const { payload } = await buildOrreryNeo({ ...deps, budgetMs: 4, clock: () => (t += 1) })
    const reached = payload.approaches.filter((a: { fine: unknown }) => a.fine !== null)
    expect(reached.length).toBeLessThan(6)
    expect(payload.missing).toContainEqual({
      id: expect.stringMatching(/^sb:/),
      reason: 'time budget spent',
    })
  })
})
