/**
 * The dwarf planets the orrery shows (#99 item 8), and how Horizons is asked for them.
 * Checked live 2026-11-12, one request at a time:
 * - '9' answers "Pluto Barycenter (9)" from DE441, and covers 3000 BC to 3000 AD;
 * - '1;', '136199;', '136472;' and '136108;' answer the names below, and refuse dates
 *   "prior to A.D. 1599-DEC-11" or "after A.D. 2501-JAN-01".
 */
import { describe, expect, it } from 'vitest'

import { dwarfByName, DWARFS, dwarfWindowJd, isDwarfFocus } from '@/lib/orrery/dwarfs'
import { SIM_MAX_MS, SIM_MIN_MS } from '@/store/orreryClock'

const DAY_MS = 86_400_000
const jdOf = (ms: number) => ms / DAY_MS + 2440587.5

describe('the dwarf planets', () => {
  it('asks Horizons for each by the command whose target name is asserted exactly', () => {
    expect(DWARFS.map((d) => [d.name, d.command, d.target])).toEqual([
      ['Pluto', '9', 'Pluto Barycenter (9)'],
      ['Ceres', '1;', '1 Ceres (A801 AA)'],
      ['Eris', '136199;', '136199 Eris (2003 UB313)'],
      ['Makemake', '136472;', '136472 Makemake (2005 FY9)'],
      ['Haumea', '136108;', '136108 Haumea (2003 EL61)'],
    ])
  })

  it('never asks by DES=', () => {
    for (const d of DWARFS) expect(d.command).not.toMatch(/DES=/i)
  })

  it('keys each by its SBDB SPK-ID', () => {
    expect(DWARFS.map((d) => d.spkid)).toEqual([
      '20134340',
      '20000001',
      '20136199',
      '20136472',
      '20136108',
    ])
  })

  it('steps 1826 days, and 120 for Ceres', () => {
    expect(DWARFS.map((d) => d.stepDays)).toEqual([1826, 120, 1826, 1826, 1826])
  })

  it("asks for Pluto's barycentre past both ends of the clock, by at least one step", () => {
    const pluto = DWARFS[0]
    if (!pluto) throw new Error('no Pluto')
    const { startJd, stopJd } = dwarfWindowJd(pluto)
    expect(startJd + pluto.stepDays).toBeLessThanOrEqual(jdOf(SIM_MIN_MS))
    expect(stopJd - pluto.stepDays).toBeGreaterThanOrEqual(jdOf(SIM_MAX_MS))
  })

  it('asks for the other four only inside JPL’s 1600–2500 window', () => {
    const limitFrom = jdOf(Date.UTC(1599, 11, 11))
    const limitTo = jdOf(Date.UTC(2501, 0, 1))
    for (const d of DWARFS.slice(1)) {
      const { startJd, stopJd } = dwarfWindowJd(d)
      expect(startJd).toBeGreaterThanOrEqual(limitFrom)
      expect(stopJd).toBeLessThanOrEqual(limitTo)
      expect(startJd).toBe(jdOf(Date.UTC(1600, 0, 1)))
    }
  })

  it('carries SBDB osculating elements for the line, with their epoch', () => {
    for (const d of DWARFS) {
      expect(d.elements.e).toBeGreaterThan(0)
      expect(d.elements.e).toBeLessThan(1)
      expect(d.elements.q).toBeGreaterThan(2)
      expect(d.elements.epochJd).toBeGreaterThan(2457000)
    }
    // Pluto's semi-major axis, q / (1 - e), about 39.6 au; Eris's about 67.9 au.
    const a = (i: number) => {
      const el = DWARFS[i]?.elements
      return el ? el.q / (1 - el.e) : Number.NaN
    }
    expect(a(0)).toBeCloseTo(39.59, 1)
    expect(a(2)).toBeCloseTo(67.93, 1)
  })

  it('finds one by name, loosely, for links', () => {
    expect(dwarfByName('pluto')?.spkid).toBe('20134340')
    expect(dwarfByName('Makemake')?.spkid).toBe('20136472')
    expect(dwarfByName(' ERIS ')?.spkid).toBe('20136199')
    expect(dwarfByName('Jupiter')).toBeUndefined()
  })

  it('tells a link focus that needs the dwarf data: its key or its name', () => {
    expect(isDwarfFocus('sbc:20134340')).toBe(true)
    expect(isDwarfFocus('pluto')).toBe(true)
    expect(isDwarfFocus('Haumea')).toBe(true)
    expect(isDwarfFocus('sbc:1004083')).toBe(false)
    expect(isDwarfFocus('Mars')).toBe(false)
  })
})
