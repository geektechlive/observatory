/**
 * Close-approach data for the orrery (#92): JPL CAD, Scout and ESA NEOCC parsers, plus
 * how a small body is named to Horizons. Fixtures are real answers fetched 2026-11-07
 * (tests/unit/fixtures/neo, tests/unit/fixtures/horizons), trimmed.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { parseHorizonsVectors } from '@/lib/horizons'
import {
  cadApproaches,
  cadDesignations,
  horizonsSmallBodyCommand,
  neoccDesignation,
  parseNeoccCloseApproaches,
  parseNeoccRiskList,
  scoutObjects,
  selectApproaches,
  selectApproachesAround,
  splitApproachSpans,
  targetMatchesDesignation,
} from '@/lib/orrery/closeApproach'

const neo = (name: string) => readFileSync(join(__dirname, 'fixtures', 'neo', name), 'utf8')
const horizons = (name: string) =>
  readFileSync(join(__dirname, 'fixtures', 'horizons', `${name}.txt`), 'utf8')

describe('JPL CAD', () => {
  const rows = cadApproaches(JSON.parse(neo('cad.json')))

  it('reads every row by field name, with the 3-sigma range', () => {
    expect(rows).toHaveLength(6)
    const ue2 = rows.find((r) => r.des === '2026 UE2')
    expect(ue2).toMatchObject({
      des: '2026 UE2',
      name: '(2026 UE2)',
      orbitId: '4',
      jd: 2461342.559430817,
      date: '2026-10-29T01:26:00.000Z',
      distAu: 0.000826995320414752,
      distMinAu: 0.000826809795845741,
      distMaxAu: 0.000827180835871773,
      vRelKms: 7.66787827813973,
      vInfKms: 7.23550952748115,
      tSigma: '< 00:01',
      h: 29.337,
      diameterKm: null,
    })
  })

  it('keeps a numbered object’s full name', () => {
    expect(rows.find((r) => r.des === '524522')?.name).toBe('524522 Zoozve (2002 VE68)')
  })

  it('refuses an answer that is not CAD (a contract failure, not an empty list)', () => {
    expect(() => cadApproaches({ message: 'invalid value', code: '400' })).toThrow(/CAD/)
    expect(() => cadApproaches({ ...JSON.parse(neo('cad.json')), fields: ['des'] })).toThrow(
      /missing the jd field/,
    )
  })

  it('reads the PHA filter answer as a set of designations', () => {
    expect([...cadDesignations(JSON.parse(neo('cad-pha.json')))]).toEqual(['524522', '2001 KF54'])
  })
})

describe('selectApproaches', () => {
  const rows = cadApproaches(JSON.parse(neo('cad.json')))

  it('puts hazardous objects first, then the closest, and stops at the limit', () => {
    const picked = selectApproaches(rows, new Set(['524522']), 3)
    expect(picked.map((r) => r.des)).toEqual(['524522', '2026 VY2', '2026 UE2'])
    expect(picked.map((r) => r.pha)).toEqual([true, false, false])
  })

  it('takes one row per object, its closest approach', () => {
    const first = rows[0]
    if (!first) throw new Error('fixture has no rows')
    const twice = [...rows, { ...first, jd: first.jd + 5, distAu: 0.04 }]
    const picked = selectApproaches(twice, new Set(), 25)
    expect(picked.filter((r) => r.des === first.des)).toHaveLength(1)
    expect(picked.find((r) => r.des === first.des)?.distAu).toBe(first.distAu)
  })
})

describe('selectApproachesAround (#136)', () => {
  const rows = cadApproaches(JSON.parse(neo('cad.json')))
  const ue2 = rows.find((r) => r.des === '2026 UE2')
  if (!ue2) throw new Error('fixture lacks 2026 UE2')

  it('keeps the near-now objects first, then fills from the rest of the window', () => {
    // Pretend "now" is UE2's approach: only it is within half a day, though others are closer.
    const picked = selectApproachesAround(rows, new Set(), ue2.jd, {
      nearDays: 0.5,
      nearLimit: 1,
      limit: 3,
    })
    expect(picked).toHaveLength(3)
    expect(picked.map((r) => r.des)).toContain('2026 UE2')
    // The other two are the closest of the rest, hazardous ones first as ever.
    const rest = selectApproaches(
      rows.filter((r) => r.des !== '2026 UE2'),
      new Set(),
      2,
    ).map((r) => r.des)
    expect(picked.map((r) => r.des).filter((d) => d !== '2026 UE2')).toEqual(rest)
  })

  it('ranks the result the usual way: hazardous first, then the closest', () => {
    const picked = selectApproachesAround(rows, new Set(['524522']), ue2.jd, {
      nearDays: 30,
      nearLimit: 25,
      limit: 40,
    })
    expect(picked.map((r) => r.des)).toEqual(
      selectApproaches(rows, new Set(['524522']), 40).map((r) => r.des),
    )
  })
})

describe('splitApproachSpans (#136)', () => {
  const step = 0.125
  const start = 2461320.5
  const samples = Array.from({ length: 481 }, (_, i) => ({
    jd: start + i * step,
    x: i,
    y: 0,
    z: 0,
    vx: 1,
    vy: 0,
    vz: 0,
  }))

  it('keeps every eighth 3 h sample (daily) over the window, ends included', () => {
    const { wide } = splitApproachSpans(samples, start + 30, { wideEvery: 8, closeDays: 3 })
    expect(wide).toHaveLength(61)
    expect(wide[0]?.jd).toBe(start)
    expect(wide.at(-1)?.jd).toBe(start + 60)
    expect((wide[1]?.jd ?? 0) - (wide[0]?.jd ?? 0)).toBe(1)
  })

  it('keeps the 3 h samples within ±3 days of closest approach', () => {
    const ca = start + 30.3
    const { close } = splitApproachSpans(samples, ca, { wideEvery: 8, closeDays: 3 })
    expect(close).not.toBeNull()
    if (!close) return
    expect(close[0]?.jd).toBeGreaterThanOrEqual(ca - 3)
    expect(close[0]?.jd).toBeLessThan(ca - 3 + step)
    expect(close.at(-1)?.jd).toBeLessThanOrEqual(ca + 3)
    expect(close.length).toBe(48)
  })

  it('clips the close span at the window edge, and drops it when nothing is left', () => {
    const edge = splitApproachSpans(samples, start + 59.5, { wideEvery: 8, closeDays: 3 })
    expect(edge.close?.at(-1)?.jd).toBe(start + 60)
    expect(splitApproachSpans(samples, start + 90, { wideEvery: 8, closeDays: 3 }).close).toBeNull()
  })
})

describe('naming a small body to Horizons', () => {
  it('asks for a numbered asteroid by number: 433 is Eros', () => {
    expect(horizonsSmallBodyCommand('433')).toBe('433;')
    const eros = parseHorizonsVectors(horizons('eros'))
    expect(eros?.target).toBe('433 Eros (A898 PA)')
    expect(targetMatchesDesignation('433', eros?.target ?? null)).toBe(true)
  })

  it('catches DES=433, which Horizons answers with 2005 QN173 (spec correction)', () => {
    const wrong = parseHorizonsVectors(horizons('des-433'))
    expect(wrong?.target).toBe('248370 (2005 QN173)')
    expect(targetMatchesDesignation('433', wrong?.target ?? null)).toBe(false)
  })

  it('asks for a provisional designation with DES=', () => {
    expect(horizonsSmallBodyCommand('2026 UE2')).toBe('DES=2026 UE2;')
    const ue2 = parseHorizonsVectors(horizons('2026-ue2'))
    expect(ue2?.target).toBe('(2026 UE2)')
    expect(targetMatchesDesignation('2026 UE2', ue2?.target ?? null)).toBe(true)
    expect(targetMatchesDesignation('2026 UE', ue2?.target ?? null)).toBe(false)
  })

  it('matches a numbered object with a name, and not a number that merely starts the same', () => {
    expect(targetMatchesDesignation('524522', '524522 Zoozve (2002 VE68)')).toBe(true)
    expect(targetMatchesDesignation('52452', '524522 Zoozve (2002 VE68)')).toBe(false)
    expect(targetMatchesDesignation('524522', null)).toBe(false)
  })

  it('reads real vectors for the provisional object', () => {
    expect(parseHorizonsVectors(horizons('zoozve'))?.samples).toHaveLength(5)
  })
})

describe('JPL Scout', () => {
  const objects = scoutObjects(JSON.parse(neo('scout.json')))

  it('keeps the summary with numbers parsed and the uncertainty fields', () => {
    expect(objects).toHaveLength(4)
    expect(objects[0]).toMatchObject({
      objectName: '6L42B21',
      neoScore: 100,
      phaScore: 0,
      rating: 0,
      unc: 0.18,
      uncP1: 0.59,
      caDistLd: 12,
      vInfKms: 9.1,
      h: 26.1,
      vMag: 20.5,
      nObs: 23,
      arcHours: 21.07,
      lastRun: '2026-11-06T08:18:00.000Z',
    })
  })

  it('refuses an answer without a data list', () => {
    expect(() => scoutObjects({ signature: {} })).toThrow(/Scout/)
  })
})

describe('ESA NEOCC', () => {
  it('writes designations the way JPL does', () => {
    expect(neoccDesignation('2026VZ3')).toBe('2026 VZ3')
    expect(neoccDesignation('2025OB')).toBe('2025 OB')
    expect(neoccDesignation('1979XB')).toBe('1979 XB')
    expect(neoccDesignation('2015BY310')).toBe('2015 BY310')
  })

  it('reads the risk list, numbered objects included', () => {
    const list = parseNeoccRiskList(neo('esa_risk_list.txt'))
    expect(list.updated).toBe('2026-11-07T04:20:00.000Z')
    expect(list.entries).toHaveLength(7)
    expect(list.entries[0]).toEqual({
      key: '2008 JL3',
      number: null,
      designation: '2008 JL3',
      name: null,
      diameterM: 30,
      diameterEstimated: true,
      impactDate: '2027-05-01T09:05:00.000Z',
      ipMax: 1.66e-4,
      psMax: -2.1,
      torino: 0,
      velocityKms: 14.01,
      years: '2027-2126',
      ipCum: 1.84e-4,
      psCum: -2.1,
    })
    expect(list.entries.find((e) => e.key === '2023 TB2')?.torino).toBeNull()
    expect(list.entries.at(-1)).toMatchObject({
      key: '443104',
      number: '443104',
      designation: '2013 XK22',
    })
  })

  it('reads the upcoming close approaches', () => {
    const list = parseNeoccCloseApproaches(neo('esa_upcoming_close_app.txt'))
    expect(list.updated).toBe('2026-11-07T04:02:00.000Z')
    expect(list.entries).toHaveLength(7)
    expect(list.entries[2]).toEqual({
      key: '2026 VK2',
      number: null,
      designation: '2026 VK2',
      name: null,
      date: '2026-11-08',
      missKm: 871716,
      missAu: 0.005827,
      missLd: 2.268,
      diameterM: 3,
      diameterEstimated: true,
      h: 30.2,
      maxBrightMag: 20.6,
      vRelKms: 4.9,
      caiIndex: 3.694,
    })
    expect(list.entries.at(-1)).toMatchObject({ key: '893859', designation: '2016 VO1' })
  })

  it('refuses a file that is not a NEOCC table', () => {
    expect(() => parseNeoccRiskList('<html>maintenance</html>')).toThrow(/NEOCC/)
    expect(() => parseNeoccCloseApproaches('')).toThrow(/NEOCC/)
  })
})
