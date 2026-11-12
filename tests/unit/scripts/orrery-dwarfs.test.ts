/**
 * The refresh job's dwarf planets (#99 item 8), in their own KV key so only visitors who
 * switch them on pay for them. One Horizons request per body, never overlapping (#88).
 * The header is 24P's real answer (tests/unit/fixtures/smallbodies) with the target
 * renamed; the data rows are generated over whatever span was asked.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { DWARFS, dwarfWindowJd } from '@/lib/orrery/dwarfs'
import { OrreryDwarfsSchema } from '@/schemas/orreryDwarfs'

// @ts-expect-error plain ESM script, no type declarations
import { buildOrreryDwarfs } from '../../../scripts/orrery-dwarfs.mjs'

const HEAD =
  readFileSync(join(__dirname, '..', 'fixtures', 'smallbodies', 'horizons-24p.txt'), 'utf8').split(
    '$$SOE',
  )[0] ?? ''
const NOW = Date.UTC(2026, 10, 12, 4)

type Dwarf = {
  id: string
  name: string
  target: string
  coarse: { step: number; samples: number[] }
}

/** A Horizons answer for the asked span, named after the body asked for (or `rename`). */
function answer(url: URL, rename?: string): string {
  const strip = (v: string | null) => (v ?? '').replace(/^'|'$/g, '')
  const command = strip(url.searchParams.get('COMMAND'))
  const start = Number(strip(url.searchParams.get('START_TIME')).replace(/^JD/, ''))
  const stop = Number(strip(url.searchParams.get('STOP_TIME')).replace(/^JD/, ''))
  const step = Number.parseFloat(strip(url.searchParams.get('STEP_SIZE')))
  const n = Math.floor((stop - start) / step) + 1
  const rows = Array.from(
    { length: n },
    (_, i) => `${String(start + i * step)}, A.D. x, 2, 0.123456789, -1.000000449, 0, 0, 0,`,
  )
  const name = rename ?? DWARFS.find((d) => d.command === command)?.target ?? '?'
  const head = HEAD.replace(/^Target body name:.*$/m, `Target body name: ${name}   {source: JPL#1}`)
  return `${head}$$SOE\n${rows.join('\n')}\n$$EOE\n`
}

function fake(horizons: (url: URL) => string = (u) => answer(u)) {
  const urls: URL[] = []
  let inFlight = 0
  const fetchHorizonsText = async (raw: string) => {
    inFlight += 1
    try {
      if (inFlight > 1) throw new Error('HTTP 503 (overlapping JPL request)')
      await new Promise((r) => setTimeout(r, 1))
      const url = new URL(raw)
      urls.push(url)
      return horizons(url)
    } finally {
      inFlight -= 1
    }
  }
  return { urls, deps: { now: NOW, fetchHorizonsText, pauseMs: 0 } }
}

describe('buildOrreryDwarfs', () => {
  it('builds a payload the schema accepts: one request per body, the target asserted', async () => {
    const { deps, urls } = fake()
    const { payload, requests } = await buildOrreryDwarfs(deps)
    expect(OrreryDwarfsSchema.parse(payload)).toBeTruthy()
    expect(requests).toBe(5)
    expect(
      urls.map((u) => [u.searchParams.get('COMMAND'), u.searchParams.get('STEP_SIZE')]),
    ).toEqual([
      ["'9'", "'1826 d'"],
      ["'1;'", "'120 d'"],
      ["'136199;'", "'1826 d'"],
      ["'136472;'", "'1826 d'"],
      ["'136108;'", "'1826 d'"],
    ])
    expect(payload.dwarfs.map((d: Dwarf) => [d.id, d.name, d.target])).toEqual([
      ['sb:20134340', 'Pluto', 'Pluto Barycenter (9)'],
      ['sb:20000001', 'Ceres', '1 Ceres (A801 AA)'],
      ['sb:20136199', 'Eris', '136199 Eris (2003 UB313)'],
      ['sb:20136472', 'Makemake', '136472 Makemake (2005 FY9)'],
      ['sb:20136108', 'Haumea', '136108 Haumea (2003 EL61)'],
    ])
    expect(payload.missing).toEqual([])
  })

  it('puts each window in the URL: the whole clock for Pluto, 1600–2500 for the rest', async () => {
    const { deps, urls } = fake()
    await buildOrreryDwarfs(deps)
    DWARFS.forEach((spec, i) => {
      const { startJd, stopJd } = dwarfWindowJd(spec)
      expect(urls[i]?.searchParams.get('START_TIME')).toBe(`'JD${String(startJd)}'`)
      expect(urls[i]?.searchParams.get('STOP_TIME')).toBe(`'JD${String(stopJd)}'`)
      expect(urls[i]?.searchParams.get('CENTER')).toBe("'500@10'")
    })
  })

  it('keeps positions only, at 6 decimals', async () => {
    const { deps } = fake()
    const { payload } = await buildOrreryDwarfs(deps)
    const ceres = payload.dwarfs[1] as Dwarf
    expect(ceres.coarse.step).toBe(120)
    expect(ceres.coarse.samples.slice(0, 3)).toEqual([2, 0.123457, -1])
    expect(ceres.coarse.samples.length % 3).toBe(0)
  })

  it('refuses an answer for the wrong body and lists it as missing', async () => {
    const { deps } = fake((u) =>
      u.searchParams.get('COMMAND') === "'1;'"
        ? answer(u, '1 Ceres (A801 AA) impostor')
        : answer(u),
    )
    const { payload } = await buildOrreryDwarfs(deps)
    expect(payload.dwarfs.map((d: Dwarf) => d.name)).toEqual([
      'Pluto',
      'Eris',
      'Makemake',
      'Haumea',
    ])
    expect(payload.missing).toEqual([
      { id: 'sb:20000001', reason: expect.stringMatching(/impostor/) },
    ])
  })

  it('reuses spans under a day old, per body, and fetches one the last copy lacks', async () => {
    const { payload: previous } = await buildOrreryDwarfs(fake().deps)
    const a = fake()
    const later = await buildOrreryDwarfs({ ...a.deps, now: NOW + 6 * 3_600_000, previous })
    expect(a.urls).toHaveLength(0)
    expect(later.payload.dwarfs).toEqual(previous.dwarfs)
    expect(later.payload.coarseFetchedAt).toBe(previous.coarseFetchedAt)

    const partial = { ...previous, dwarfs: previous.dwarfs.slice(1) }
    const b = fake()
    await buildOrreryDwarfs({ ...b.deps, now: NOW + 6 * 3_600_000, previous: partial })
    expect(b.urls.map((u) => u.searchParams.get('COMMAND'))).toEqual(["'9'"])

    const c = fake()
    await buildOrreryDwarfs({ ...c.deps, now: NOW + 25 * 3_600_000, previous })
    expect(c.urls).toHaveLength(5)
  })

  it('keeps the last span of a body that fails, and says so', async () => {
    const { payload: previous } = await buildOrreryDwarfs(fake().deps)
    const { deps } = fake(() => 'API down')
    const { payload } = await buildOrreryDwarfs({ ...deps, now: NOW + 25 * 3_600_000, previous })
    expect(payload.dwarfs).toEqual(previous.dwarfs)
    expect(payload.missing.map((m: { id: string }) => m.id)).toEqual(
      DWARFS.map((d) => `sb:${d.spkid}`),
    )
  })

  it('retries a body that failed on the next run, not a day later', async () => {
    const { payload: previous } = await buildOrreryDwarfs(fake().deps)
    const flaky = fake((u) => (u.searchParams.get('COMMAND') === "'1;'" ? 'API down' : answer(u)))
    const { payload: failed } = await buildOrreryDwarfs({
      ...flaky.deps,
      now: NOW + 25 * 3_600_000,
      previous,
    })
    expect(failed.missing.map((m: { id: string }) => m.id)).toEqual(['sb:20000001'])
    const next = fake()
    await buildOrreryDwarfs({ ...next.deps, now: NOW + 31 * 3_600_000, previous: failed })
    expect(next.urls.map((u) => u.searchParams.get('COMMAND'))).toContain("'1;'")
  })

  it('respects the time budget: no request once it is spent', async () => {
    const { deps, urls } = fake()
    let t = 0
    const { payload } = await buildOrreryDwarfs({ ...deps, budgetMs: 2, clock: () => (t += 1) })
    expect(urls.length).toBeLessThan(5)
    expect(payload.dwarfs).toHaveLength(urls.length)
    expect(payload.missing).toContainEqual({ id: 'sb:20136108', reason: 'time budget spent' })
  })

  it('fails outright when no body could be placed', async () => {
    await expect(buildOrreryDwarfs(fake(() => 'API down').deps)).rejects.toThrow(/no dwarf planet/)
  })
})
