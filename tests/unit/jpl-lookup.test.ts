import { describe, expect, it } from 'vitest'

import {
  horizonsTrajectoryUrl,
  lookupCommand,
  lookupTargetMatches,
  MAX_TRAJECTORY_SAMPLES,
  parseLookupQuery,
  parseSbdbLookup,
  parseTrajectoryParams,
  sbdbLookupUrl,
  sbdbSpkUrl,
  trajectorySampleCount,
} from '@/lib/orrery/jplLookup'

import oneP from './fixtures/jpl-lookup/sbdb-1P.json'
import threeI from './fixtures/jpl-lookup/sbdb-3I.json'
import apophis from './fixtures/jpl-lookup/sbdb-apophis.json'
import halley from './fixtures/jpl-lookup/sbdb-halley.json'
import none from './fixtures/jpl-lookup/sbdb-none.json'
import eros from './fixtures/jpl-lookup/sbdb-spk433.json'

// Fixtures are real SBDB answers, fetched one at a time on 2026-11-07 (#100).

describe('parseLookupQuery (#100)', () => {
  it('trims and collapses whitespace', () => {
    expect(parseLookupQuery('  2026   VP1 ')).toEqual({ ok: true, q: '2026 VP1' })
  })

  it('keeps names with apostrophes, slashes and the okina', () => {
    expect(parseLookupQuery('C/2025 N1')).toEqual({ ok: true, q: 'C/2025 N1' })
    expect(parseLookupQuery("1I/'Oumuamua").ok).toBe(true)
    expect(parseLookupQuery('ʻOumuamua').ok).toBe(true)
  })

  it('allows one trailing wildcard after at least three characters', () => {
    expect(parseLookupQuery('2026 VP*')).toEqual({ ok: true, q: '2026 VP*' })
    expect(parseLookupQuery('ab*').ok).toBe(false)
    expect(parseLookupQuery('*eros').ok).toBe(false)
    expect(parseLookupQuery('er*os').ok).toBe(false)
  })

  it('refuses empty, too short, too long and odd characters', () => {
    expect(parseLookupQuery(null).ok).toBe(false)
    expect(parseLookupQuery(' ').ok).toBe(false)
    expect(parseLookupQuery('a').ok).toBe(false)
    expect(parseLookupQuery('x'.repeat(41)).ok).toBe(false)
    expect(parseLookupQuery('eros;drop').ok).toBe(false)
    expect(parseLookupQuery('<script>').ok).toBe(false)
  })
})

describe('SBDB URLs (#100)', () => {
  it('encodes the search string', () => {
    expect(sbdbLookupUrl('2026 VP*')).toBe('https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=2026+VP*')
  })

  it('asks by SPK-ID', () => {
    expect(sbdbSpkUrl('20000433')).toBe('https://ssd-api.jpl.nasa.gov/sbdb.api?spk=20000433')
  })
})

describe('parseSbdbLookup (#100)', () => {
  it('reads a numbered asteroid', () => {
    expect(parseSbdbLookup(apophis)).toEqual({
      type: 'object',
      object: {
        id: 'sb:20099942',
        spkid: '20099942',
        name: '99942 Apophis (2004 MN4)',
        designation: '99942',
        prefix: null,
        kind: 'asteroid',
        orbitClass: { code: 'ATE', name: 'Aten' },
        neo: true,
        pha: true,
      },
    })
  })

  it('reads comets, numbered and not', () => {
    const p = parseSbdbLookup(oneP)
    expect(p?.type === 'object' && p.object).toMatchObject({
      spkid: '1000036',
      designation: '1P',
      prefix: 'P',
      kind: 'comet',
      name: '1P/Halley',
    })
    const i = parseSbdbLookup(threeI)
    expect(i?.type === 'object' && i.object).toMatchObject({
      spkid: '1004083',
      designation: '2025 N1',
      prefix: 'C',
      kind: 'comet',
      orbitClass: { code: 'HYP', name: 'Hyperbolic Comet' },
    })
  })

  it('reads a list of matches', () => {
    expect(parseSbdbLookup(halley)).toEqual({
      type: 'list',
      count: 2,
      matches: [
        { designation: '2688', name: '2688 Halley (1982 HG1)' },
        { designation: '1P', name: '1P/Halley' },
      ],
    })
  })

  it('reads "not found" as none', () => {
    expect(parseSbdbLookup(none)).toEqual({ type: 'none' })
  })

  it('returns null for a shape it does not know', () => {
    expect(parseSbdbLookup({ hello: 1 })).toBeNull()
    expect(parseSbdbLookup(null)).toBeNull()
    expect(parseSbdbLookup({ object: { spkid: 'x', kind: 'zz', des: '1' } })).toBeNull()
  })
})

describe('Horizons naming for a looked-up object (#100)', () => {
  const object = (o: unknown) => {
    const r = parseSbdbLookup(o)
    if (r?.type !== 'object') throw new Error('fixture is not an object')
    return r.object
  }

  it('asks an asteroid by SPK-ID and a comet with CAP;NOFRAG', () => {
    // DES=<SPK-ID>; returned 433 Eros for 20000433, checked live 2026-11-07.
    expect(lookupCommand(object(eros))).toBe('DES=20000433;')
    expect(lookupCommand(object(oneP))).toBe('DES=1000036;CAP;NOFRAG')
  })

  it('checks Horizons answered for the object asked', () => {
    expect(lookupTargetMatches(object(eros), '433 Eros (A898 PA)')).toBe(true)
    expect(lookupTargetMatches(object(eros), '248370 (2005 QN173)')).toBe(false)
    expect(lookupTargetMatches(object(oneP), '1P/Halley')).toBe(true)
    expect(lookupTargetMatches(object(threeI), 'ATLAS (C/2025 N1)')).toBe(true)
    expect(lookupTargetMatches(object(threeI), 'ATLAS (C/2025 N2)')).toBe(false)
    expect(lookupTargetMatches(object(apophis), null)).toBe(false)
  })
})

describe('parseTrajectoryParams (#100)', () => {
  const params = (s: string) => new URLSearchParams(s)

  it('reads a valid request', () => {
    expect(
      parseTrajectoryParams(params('id=sb:20000433&start=2025-09-04&end=2027-09-04&step=2d')),
    ).toEqual({
      ok: true,
      value: { spkid: '20000433', start: '2025-09-04', end: '2027-09-04', stepMinutes: 2880 },
    })
    // The same step written in hours is the same request (the cache key is in minutes).
    expect(
      parseTrajectoryParams(params('id=sb:1004083&start=2025-09-04&end=2027-09-04&step=48h')),
    ).toMatchObject({ ok: true, value: { stepMinutes: 2880 } })
    // A close pass's dense span (#215): four days at 10 minutes, 577 samples.
    expect(
      parseTrajectoryParams(params('id=sb:54670410&start=2026-11-10&end=2026-11-14&step=10m')),
    ).toEqual({
      ok: true,
      value: { spkid: '54670410', start: '2026-11-10', end: '2026-11-14', stepMinutes: 10 },
    })
    expect(
      trajectorySampleCount({
        spkid: '1',
        start: '2026-11-10',
        end: '2026-11-14',
        stepMinutes: 10,
      }),
    ).toBe(577)
  })

  it('refuses a bad id, date or step', () => {
    const bad = [
      'id=20000433&start=2026-11-01&end=2026-11-03&step=1d',
      'id=sb:abc&start=2026-11-01&end=2026-11-03&step=1d',
      'id=sb:1&start=2026-13-01&end=2026-11-03&step=1d',
      'id=sb:1&start=2026-02-30&end=2026-11-03&step=1d',
      'id=sb:1&start=2026-11-03&end=2026-11-01&step=1d',
      'id=sb:1&start=2026-11-01&end=2026-11-01&step=1d',
      'id=sb:1&start=2026-11-01&end=2026-11-03&step=5m',
      'id=sb:1&start=2026-11-01&end=2026-11-03&step=10s',
      'id=sb:1&start=2026-11-01&end=2026-11-03&step=0h',
      'id=sb:1&start=2026-11-01&end=2026-11-03',
      'id=sb:1&start=1850-01-01&end=1850-02-01&step=1d',
      'id=sb:1&start=2100-12-01&end=2101-01-02&step=1d',
    ]
    for (const q of bad) expect(parseTrajectoryParams(params(q)).ok, q).toBe(false)
  })

  it('caps the number of samples', () => {
    // 2 years at 1 d is 731 samples, over the cap.
    const r = parseTrajectoryParams(params('id=sb:1&start=2026-01-01&end=2028-01-01&step=1d'))
    expect(r.ok).toBe(false)
    expect(MAX_TRAJECTORY_SAMPLES).toBeLessThan(731)
    const fits = parseTrajectoryParams(params('id=sb:1&start=2025-09-04&end=2027-09-04&step=2d'))
    expect(fits.ok).toBe(true)
  })
})

describe('horizonsTrajectoryUrl (#100)', () => {
  it('asks heliocentric ecliptic vectors in au and au/day, like the refresh job', () => {
    const url = new URL(
      horizonsTrajectoryUrl('DES=20000433;', {
        spkid: '20000433',
        start: '2026-11-01',
        end: '2026-11-03',
        stepMinutes: 1440,
      }),
    )
    expect(url.origin + url.pathname).toBe('https://ssd.jpl.nasa.gov/api/horizons.api')
    const p = url.searchParams
    expect(p.get('COMMAND')).toBe("'DES=20000433;'")
    expect(p.get('EPHEM_TYPE')).toBe('VECTORS')
    expect(p.get('CENTER')).toBe("'500@10'")
    expect(p.get('REF_PLANE')).toBe('ECLIPTIC')
    expect(p.get('OUT_UNITS')).toBe('AU-D')
    expect(p.get('VEC_TABLE')).toBe('2')
    expect(p.get('CSV_FORMAT')).toBe('YES')
    expect(p.get('START_TIME')).toBe("'2026-11-01'")
    expect(p.get('STOP_TIME')).toBe("'2026-11-03'")
    expect(p.get('STEP_SIZE')).toBe("'1 d'")
    const hourly = new URL(
      horizonsTrajectoryUrl('DES=1004083;CAP;NOFRAG', {
        spkid: '1004083',
        start: '2026-11-01',
        end: '2026-11-02',
        stepMinutes: 360,
      }),
    )
    expect(hourly.searchParams.get('STEP_SIZE')).toBe("'6 h'")
    // Minutes as the refresh job writes them ("10 m"), not "0.1666… h" (#215).
    const dense = new URL(
      horizonsTrajectoryUrl('DES=54670410;', {
        spkid: '54670410',
        start: '2026-11-10',
        end: '2026-11-14',
        stepMinutes: 10,
      }),
    )
    expect(dense.searchParams.get('STEP_SIZE')).toBe("'10 m'")
  })
})
