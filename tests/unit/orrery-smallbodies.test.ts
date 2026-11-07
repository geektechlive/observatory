/**
 * Which comets the orrery shows, and how Horizons is asked for them and for the three
 * interstellar objects (#99). Naming rules were found live on 2026-11-07, one request
 * at a time:
 * - a bare SPK-ID ("1004083;") is refused as a record number out of bounds;
 * - "DES=<SPK-ID>;" names a one-apparition comet or 1I, but a periodic comet's SPK-ID
 *   (24P's 1000077) lists every apparition instead of answering;
 * - "DES=<SPK-ID>;CAP;NOFRAG" picks the current apparition and the main nucleus, but
 *   searches comets only, so 1I (filed as an asteroid) answers "No matches found".
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { conicPosition } from '@/lib/orrery/conic'
import {
  cometDesignation,
  INTERSTELLAR,
  parseSbdbComets,
  sbdbCometQueryUrl,
  selectComets,
  smallBodyCommand,
  targetMatchesSmallBody,
} from '@/lib/orrery/smallBodies'

const sbdb = () =>
  JSON.parse(
    readFileSync(join(__dirname, 'fixtures', 'smallbodies', 'sbdb-comets.json'), 'utf8'),
  ) as unknown

const NOW_JD = Date.UTC(2026, 10, 7) / 86_400_000 + 2440587.5

describe('the interstellar catalogue', () => {
  it('lists 1I, 2I and 3I with the SPK-IDs SBDB gives them', () => {
    expect(INTERSTELLAR.map((o) => [o.name, o.des, o.spkid, o.kind])).toEqual([
      ['1I/ʻOumuamua', 'A/2017 U1', '50788063', 'asteroid'],
      ['2I/Borisov', 'C/2019 Q4', '1003639', 'comet'],
      ['3I/ATLAS', 'C/2025 N1', '1004083', 'comet'],
    ])
  })
})

describe('naming a small body to Horizons', () => {
  it('asks comets by SPK-ID with CAP;NOFRAG, and an asteroid by SPK-ID alone', () => {
    expect(smallBodyCommand('1000077', 'comet')).toBe('DES=1000077;CAP;NOFRAG')
    expect(smallBodyCommand('50788063', 'asteroid')).toBe('DES=50788063;')
  })

  it("writes JPL's designation: numbered periodic comets bare, the rest with their prefix", () => {
    expect(cometDesignation('P', '24P')).toBe('24P')
    expect(cometDesignation('C', '2025 N1')).toBe('C/2025 N1')
    expect(cometDesignation('P', '2026 T1')).toBe('P/2026 T1')
    expect(cometDesignation('A', '2017 U1')).toBe('A/2017 U1')
  })

  it("checks Horizons' target name against the designation asked for", () => {
    expect(targetMatchesSmallBody('24P', '24P/Schaumasse')).toBe(true)
    expect(targetMatchesSmallBody('24P', '124P/Mrkos')).toBe(false)
    expect(targetMatchesSmallBody('C/2025 N1', 'ATLAS (C/2025 N1)')).toBe(true)
    expect(targetMatchesSmallBody('A/2017 U1', "1I/'Oumuamua (A/2017 U1)")).toBe(true)
    expect(targetMatchesSmallBody('C/2025 N1', 'ATLAS (C/2025 N12)')).toBe(false)
    expect(targetMatchesSmallBody('C/2025 N1', null)).toBe(false)
  })
})

describe('choosing comets', () => {
  it('asks SBDB for comets within a year of perihelion, inside 5 au, at full precision', () => {
    const url = new URL(sbdbCometQueryUrl(NOW_JD))
    expect(url.origin + url.pathname).toBe('https://ssd-api.jpl.nasa.gov/sbdb_query.api')
    expect(url.searchParams.get('sb-kind')).toBe('c')
    expect(url.searchParams.get('full-prec')).toBe('true')
    expect(JSON.parse(url.searchParams.get('sb-cdata') ?? '')).toEqual({
      AND: [`tp|RG|${String(NOW_JD - 365)}|${String(NOW_JD + 365)}`, 'q|LT|5'],
    })
  })

  it("reads SBDB's rows into numbers, dropping rows with no elements", () => {
    const comets = parseSbdbComets(sbdb())
    expect(comets.length).toBeGreaterThan(50)
    expect(comets[0]).toEqual({
      name: '24P/Schaumasse',
      des: '24P',
      pdes: '24P',
      spkid: '1000077',
      e: 0.707909552000865,
      q: 1.184637149648941,
      tp: Number('2461049.059244143273'),
      i: 11.50232943610609,
      om: 78.28793113152491,
      w: 58.47910605334581,
      m1: 14.6,
      k1: 8,
    })
    expect(() => parseSbdbComets({ fields: ['x'], data: [] })).toThrow(/fields/)
  })

  // A rough Earth for the test: a circle at 1 au, at its mean longitude.
  const earthAt = (jd: number) => {
    const L = ((100.46457166 + 0.98560028 * (jd - 2451545)) * Math.PI) / 180
    return { x: Math.cos(L), y: Math.sin(L), z: 0 }
  }

  it('ranks by the total magnitude JPL predicts for tonight, brightest first', () => {
    const chosen = selectComets(parseSbdbComets(sbdb()), NOW_JD, {
      positionAt: conicPosition,
      earthAt,
    })
    // A quiet month: on 2026-11-07 only two comets forecast brighter than 15.
    expect(chosen).toHaveLength(12)
    expect(chosen.slice(0, 2).map((c) => c.name)).toEqual(['C/2024 T5 (ATLAS)', 'C/2026 A2 (Bok)'])
    const mags = chosen.map((c) => c.magnitude)
    expect([...mags].sort((a, b) => a - b)).toEqual(mags)
    expect(Math.max(...mags)).toBeLessThanOrEqual(18)
  })

  it('leaves out fragments of split comets and the interstellar objects', () => {
    const comets = parseSbdbComets(sbdb())
    expect(comets.filter((c) => c.pdes.includes('-')).map((c) => c.pdes)).toEqual([
      '240P-B',
      '2023 R1-B',
    ])
    const first = comets[0]
    if (!first) throw new Error('no comets')
    const visitor = { ...first, spkid: '1004083', name: '3I/ATLAS stand-in' }
    const chosen = selectComets([...comets, visitor], NOW_JD, {
      positionAt: conicPosition,
      earthAt,
      limit: 100,
      faintest: 99,
    })
    expect(chosen.some((c) => c.pdes.includes('-'))).toBe(false)
    expect(chosen.some((c) => c.spkid === '1004083')).toBe(false)
    expect(chosen.some((c) => c.spkid === first.spkid)).toBe(true)
  })
})
