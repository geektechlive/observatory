/**
 * What a Horizons answer says about a comet or interstellar object (#99): its osculating
 * elements, its brightness law, and the observations its orbit rests on. The answers are
 * real (tests/unit/fixtures/smallbodies, fetched 2026-11-07).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { parseSmallBodyHeader } from '@/lib/horizons'

const answer = (name: string) =>
  readFileSync(join(__dirname, 'fixtures', 'smallbodies', name), 'utf8')

describe('parseSmallBodyHeader', () => {
  it("reads 3I/ATLAS's elements, magnitude law and data arc", () => {
    expect(parseSmallBodyHeader(answer('horizons-3i.txt'))).toEqual({
      epochJd: 2461340.5,
      e: 6.123467394525528,
      q: 1.351998619400212,
      tp: 2460977.9417958809,
      om: 323.0251782090054,
      w: 128.7969426041922,
      i: 175.2403121571192,
      m1: 11.8,
      k1: 7.5,
      h: null,
      solutionRef: 'JPL#55',
      solutionDate: '2026-10-21',
      observations: 117,
      dataArc: { from: '2025-10-03', to: '2026-10-16' },
    })
  })

  it("reads 1I/'Oumuamua's arc from its prose note, and its H instead of M1", () => {
    const h = parseSmallBodyHeader(answer('horizons-1i.txt'))
    expect(h?.e).toBe(1.201133796102373)
    expect(h?.w).toBe(241.8105360304898)
    expect(h?.i).toBe(122.7417062847286)
    expect(h?.m1).toBeNull()
    expect(h?.h).toBe(22.08)
    expect(h?.dataArc).toEqual({ from: '2017-10-14', to: '2018-01-02' })
    expect(h?.observations).toBe(207)
    expect(h?.solutionRef).toBe('JPL#16')
  })

  it('reads a periodic comet (24P) and 2I/Borisov', () => {
    const p = parseSmallBodyHeader(answer('horizons-24p.txt'))
    expect(p?.e).toBe(0.707909552000865)
    expect(p?.k1).toBe(8)
    expect(p?.dataArc).toEqual({ from: '2000-10-07', to: '2026-06-20' })
    const b = parseSmallBodyHeader(answer('horizons-2i.txt'))
    expect(b?.e).toBe(3.356475782676596)
    expect(b?.om).toBe(308.1477292269942)
    expect(b?.dataArc).toEqual({ from: '2019-02-24', to: '2020-09-30' })
  })

  it('returns null for an answer with no elements (a planet, or an error page)', () => {
    expect(parseSmallBodyHeader('Target body name: Mars (499)\n$$SOE\n$$EOE')).toBeNull()
    expect(parseSmallBodyHeader('No matches found.')).toBeNull()
  })
})
