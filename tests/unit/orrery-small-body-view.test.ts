/**
 * Comets and the interstellar objects in the orrery (#99): which span places the marker,
 * what the line is drawn from, and what the inspector may say. Only fields the payload
 * carries are shown; nothing is computed in their place.
 */
import { describe, expect, it } from 'vitest'

import {
  isSmallBodyKey,
  lookupTwinKey,
  pathCutAu,
  smallBodyEntries,
  smallBodyFacts,
  smallBodyKey,
  smallBodyPath,
  smallBodyState,
  solutionAt,
} from '@/lib/orrery/smallBodyView'
import type { OrrerySmallBody } from '@/schemas/orrerySmallBodies'

const START = 2461326.5
/** A straight walk out from 2 au along x, `n` daily samples with velocity. */
function fine(n: number, start = START) {
  const samples: number[] = []
  for (let k = 0; k < n; k += 1) samples.push(2 + 0.01 * k, 0, 0, 0.01, 0, 0)
  return { start, step: 1, samples }
}

const base: OrrerySmallBody = {
  id: 'sb:1004119',
  spkid: '1004119',
  des: 'C/2026 A2',
  name: 'C/2026 A2 (Bok)',
  kind: 'comet',
  interstellar: false,
  discovered: null,
  magnitude: 13.8,
  m1: 10,
  k1: 10,
  h: null,
  elements: {
    epochJd: 2461249.5,
    e: 0.9976432395256172,
    q: 1.937799425332186,
    tp: 2461300,
    om: 120,
    w: 40,
    i: 60,
  },
  elementsSource: 'horizons',
  vInfKms: null,
  solution: {
    ref: 'JPL#34',
    date: '2026-11-09',
    observations: 1994,
    dataArc: { from: '2026-01-15', to: '2026-11-07' },
  },
  target: 'Bok (C/2026 A2)',
  availableFrom: null,
  availableTo: null,
  fine: fine(61),
  coarse: null,
}

const oumuamua: OrrerySmallBody = {
  ...base,
  id: 'sb:50788063',
  spkid: '50788063',
  des: 'A/2017 U1',
  name: '1I/ʻOumuamua',
  kind: 'asteroid',
  interstellar: true,
  discovered: '2017-10-19',
  magnitude: null,
  elements: { ...base.elements, e: 1.201133796102373, q: 0.2559115812959116 },
  vInfKms: 26.405273249181437,
  solution: {
    ref: 'JPL#16',
    date: '2018-06-26',
    observations: 207,
    dataArc: { from: '2017-10-14', to: '2018-01-02' },
  },
  // Coarse: three positions, 100 days apart, from JD 2458000.5.
  coarse: { start: 2458000.5, step: 100, samples: [1, 0, 0, 2, 1, 0, 3, 2, 1] },
}

const msOfJd = (jd: number) => (jd - 2440587.5) * 86_400_000

describe('smallBodyState', () => {
  it('places a comet inside its fine span and nowhere outside it', () => {
    expect(smallBodyState(base, START + 10)?.resolution).toBe('fine')
    expect(smallBodyState(base, START - 1)).toBeNull()
    expect(smallBodyState(base, START + 61)).toBeNull()
  })

  it('falls back to the coarse span for an interstellar object, never past it', () => {
    expect(smallBodyState(oumuamua, 2458050.5)?.resolution).toBe('coarse')
    expect(smallBodyState(oumuamua, 2458200.5 + 1)).toBeNull()
  })
})

describe('smallBodyPath', () => {
  it("draws an interstellar object's line through its coarse Horizons positions", () => {
    const path = smallBodyPath(oumuamua)
    expect(path.source).toBe('horizons')
    expect(path.closed).toBe(false)
    expect(path.points).toEqual([
      { x: 1, y: 0, z: 0 },
      { x: 2, y: 1, z: 0 },
      { x: 3, y: 2, z: 1 },
    ])
  })

  it("draws a comet's line from its elements, reaching past every sampled position", () => {
    const path = smallBodyPath(base)
    expect(path.source).toBe('conic')
    expect(path.points.length).toBeGreaterThan(100)
    const far = Math.max(...path.points.map((p) => Math.hypot(p.x, p.y, p.z)))
    expect(far).toBeGreaterThanOrEqual(pathCutAu(base) - 1e-6)
  })

  it('cuts the line beyond the farthest sample and beyond twice perihelion', () => {
    // Samples reach 2.6 au; q is 1.94 au: the floor (8 au) wins.
    expect(pathCutAu(base)).toBe(8)
    const far = { ...base, fine: { start: START, step: 1, samples: [9, 0, 0, 0, 0, 0] } }
    expect(pathCutAu(far)).toBeCloseTo(9 * 1.25, 9)
    const wide = { ...base, elements: { ...base.elements, q: 5 } }
    expect(pathCutAu(wide)).toBe(10)
  })

  it('draws no comet line from elements that are not numbers', () => {
    const broken = { ...base, elements: { ...base.elements, e: Number.NaN } }
    expect(smallBodyPath(broken).points).toEqual([])
  })
})

describe('solutionAt', () => {
  it("is 'observed' inside the data arc, edges included, and 'extrapolated' outside", () => {
    const sol = base.solution
    expect(solutionAt(sol, Date.UTC(2026, 0, 15))).toBe('observed')
    expect(solutionAt(sol, Date.UTC(2026, 10, 7, 23, 59))).toBe('observed')
    expect(solutionAt(sol, Date.UTC(2026, 10, 8))).toBe('extrapolated')
    expect(solutionAt(sol, Date.UTC(2026, 0, 14, 23))).toBe('extrapolated')
  })

  it('says nothing without a solution or a data arc', () => {
    expect(solutionAt(null, Date.UTC(2026, 0, 15))).toBeNull()
    const noArc = { ref: 'JPL#34', date: '2026-11-09', observations: 1994, dataArc: null }
    expect(solutionAt(noArc, Date.UTC(2026, 0, 15))).toBeNull()
  })
})

describe('smallBodyFacts', () => {
  it('gives an interstellar object its e, v∞, discovery date and solution', () => {
    const f = smallBodyFacts(oumuamua, msOfJd(2458050.5))
    expect(f.kindLabel).toBe('Interstellar object')
    expect(f.hyperbolic).toBe(true)
    expect(f.e).toBeCloseTo(1.2011, 4)
    expect(f.vInfKms).toBeCloseTo(26.41, 2)
    expect(f.discovered).toBe('2017-10-19')
    expect(f.solution?.ref).toBe('JPL#16')
    expect(f.solutionAtDate).toBe('observed')
    expect(f.span).toBe('coarse')
    expect(f.sunAu).toBeCloseTo(Math.hypot(1.5, 0.5, 0), 1)
  })

  it('never calls a comet hyperbolic or gives it a v∞, even with e just over 1', () => {
    const t5 = { ...base, elements: { ...base.elements, e: 1.0022 } }
    const f = smallBodyFacts(t5, msOfJd(START + 10))
    expect(f.kindLabel).toBe('Comet')
    expect(f.hyperbolic).toBe(false)
    expect(f.vInfKms).toBeNull()
    expect(f.discovered).toBeNull()
    expect(f.e).toBeCloseTo(1.0022, 4)
    expect(f.magnitude).toBe(13.8)
  })

  it('has no position or span outside the data', () => {
    const f = smallBodyFacts(base, msOfJd(START + 400))
    expect(f.span).toBeNull()
    expect(f.sunAu).toBeNull()
    expect(f.solutionAtDate).toBe('extrapolated')
  })
})

describe('scene keys', () => {
  it('keys comets and visitors `sbc:<SPK-ID>`, apart from close approaches (`sb:<des>`)', () => {
    const data = {
      generatedAt: '',
      coarseFetchedAt: '',
      frame: 'ecliptic-J2000' as const,
      center: 'Sun' as const,
      timeScale: 'TDB' as const,
      units: { position: 'au' as const, velocity: 'au/day' as const },
      sourceType: 'ephemeris' as const,
      provider: 'jpl-horizons' as const,
      comets: [base],
      interstellar: [oumuamua],
      dwarfs: [],
      missing: [],
    }
    expect(smallBodyEntries(data).map((e) => e.key)).toEqual(['sbc:1004119', 'sbc:50788063'])
    expect(smallBodyKey('1004083')).toBe('sbc:1004083')
  })

  it('knows its own keys and nothing else', () => {
    expect(isSmallBodyKey('sbc:1004119')).toBe(true)
    expect(isSmallBodyKey('sb:1004119')).toBe(false)
    expect(isSmallBodyKey('sb:2026 UE2')).toBe(false)
    expect(isSmallBodyKey('sbc:2026 UE2')).toBe(false)
    expect(isSmallBodyKey('sbc:')).toBe(false)
  })

  it("names a looked-up object's twin in the payload, if it is one", () => {
    expect(lookupTwinKey('lookup:50788063')).toBe('sbc:50788063')
    expect(lookupTwinKey('naif:-31')).toBeNull()
    expect(lookupTwinKey('sbc:50788063')).toBeNull()
  })
})
