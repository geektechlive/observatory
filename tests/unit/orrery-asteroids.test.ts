/**
 * This fortnight's close approaches in the orrery (#92). The fixture is a trimmed copy of
 * the live /api/orrery-neo and Earth from /api/orrery-bodies (fetched 2026-11-07):
 * 524522 Zoozve (PHA), 2026 VY2 (on ESA's risk list), 2026 UE2 and 2026 VT3.
 *
 * The chain is checked end to end against JPL's own numbers: Hermite on each asteroid's
 * Horizons samples, minus Horizons' Earth, must find CAD's closest approach (time and
 * distance), and the range rate must be negative before it and positive after.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  approachPasses,
  asteroidGeocentric,
  closestApproachFromSamples,
  DEFAULT_NEO_FILTER,
  diameterRangeM,
  esaApproachFor,
  impactTerms,
  riskEntryFor,
} from '@/lib/orrery/asteroids'
import { type OrreryTrack, OrreryTrackSchema } from '@/schemas/orreryBodies'
import { type OrreryNeo, OrreryNeoSchema } from '@/schemas/orreryNeo'

const raw = JSON.parse(
  readFileSync(join(import.meta.dirname, 'fixtures/neo/orrery-neo-trim.json'), 'utf8'),
) as { neo: unknown; earth: unknown }
const neo: OrreryNeo = OrreryNeoSchema.parse(raw.neo)
const earth: OrreryTrack = OrreryTrackSchema.parse(raw.earth)
const byId = (id: string) => {
  const a = neo.approaches.find((x) => x.id === id)
  if (!a) throw new Error(`fixture lacks ${id}`)
  return a
}

describe('closestApproachFromSamples (#92)', () => {
  it.each(['sb:524522', 'sb:2026 VY2', 'sb:2026 UE2', 'sb:2026 VT3'])(
    "finds CAD's closest approach for %s from the Horizons samples",
    (id) => {
      const a = byId(id)
      const ca = closestApproachFromSamples(a, earth)
      expect(ca).not.toBeNull()
      if (!ca) return
      // Within 30 minutes and 2% of JPL CAD's nominal (CAD and Horizons share the orbit).
      expect(Math.abs(ca.jd - a.closeApproach.jd) * 24 * 60).toBeLessThan(30)
      expect(Math.abs(ca.distAu - a.closeApproach.distAu) / a.closeApproach.distAu).toBeLessThan(
        0.02,
      )
    },
  )
})

describe('asteroidGeocentric (#92)', () => {
  it('approaches before closest approach and recedes after', () => {
    const a = byId('sb:2026 VY2')
    const before = asteroidGeocentric(a, earth, a.closeApproach.jd - 1)
    const after = asteroidGeocentric(a, earth, a.closeApproach.jd + 1)
    expect(before?.rangeRateKmS).toBeLessThan(0)
    expect(after?.rangeRateKmS).toBeGreaterThan(0)
  })

  it('is null outside the samples: never extrapolated', () => {
    const a = byId('sb:524522')
    const end = (a.fine?.start ?? 0) + (a.fine?.step ?? 0) * 160
    expect(asteroidGeocentric(a, earth, end + 0.5)).toBeNull()
    expect(asteroidGeocentric(a, earth, (a.fine?.start ?? 0) - 0.5)).toBeNull()
  })

  it('is null without a Horizons Earth: Kepler Earth is the barycentre, ~4,700 km off', () => {
    const a = byId('sb:524522')
    expect(asteroidGeocentric(a, null, a.closeApproach.jd)).toBeNull()
  })
})

describe('approachPasses (#92)', () => {
  const zoozve = byId('sb:524522')
  const vy2 = byId('sb:2026 VY2')
  const at = zoozve.closeApproach.jd

  it('keeps everything with the default filter', () => {
    for (const a of neo.approaches) expect(approachPasses(a, DEFAULT_NEO_FILTER, at)).toBe(true)
  })

  it('windows on the closest approach around the date shown', () => {
    const day = { ...DEFAULT_NEO_FILTER, window: 'day' as const }
    const week = { ...DEFAULT_NEO_FILTER, window: 'week' as const }
    expect(approachPasses(zoozve, day, at + 0.9)).toBe(true)
    expect(approachPasses(zoozve, day, at + 1.1)).toBe(false)
    expect(approachPasses(zoozve, week, at - 6.9)).toBe(true)
    expect(approachPasses(zoozve, week, at - 7.1)).toBe(false)
  })

  it('filters hazardous and risk-listed objects', () => {
    const pha = { ...DEFAULT_NEO_FILTER, hazardousOnly: true }
    const risk = { ...DEFAULT_NEO_FILTER, riskListedOnly: true }
    expect(approachPasses(zoozve, pha, at)).toBe(true)
    expect(approachPasses(vy2, pha, at)).toBe(false)
    expect(approachPasses(vy2, risk, at)).toBe(true)
    expect(approachPasses(zoozve, risk, at)).toBe(false)
  })
})

describe('diameterRangeM (#92)', () => {
  it('gives the size range from brightness, for albedos 0.25 down to 0.05', () => {
    const [lo, hi] = diameterRangeM(22)
    expect(lo).toBeCloseTo(106, 0)
    expect(hi).toBeCloseTo(237, 0)
    const [small] = diameterRangeM(29.03)
    expect(small).toBeGreaterThan(3)
    expect(small).toBeLessThan(5)
  })
})

describe('ESA matches and the four impact terms (#92, spec Part 12)', () => {
  it("finds ESA's risk-list entry and close approach by designation", () => {
    expect(riskEntryFor(neo, byId('sb:2026 VY2'))?.key).toBe('2026 VY2')
    expect(riskEntryFor(neo, byId('sb:524522'))).toBeUndefined()
    expect(esaApproachFor(neo, byId('sb:2026 VT3'))?.key).toBe('2026 VT3')
    expect(esaApproachFor(neo, byId('sb:2026 UE2'))).toBeUndefined()
  })

  it('keeps the four terms apart and never claims an impact', () => {
    const vy2 = byId('sb:2026 VY2')
    const terms = impactTerms(vy2, riskEntryFor(neo, vy2))
    expect(terms.map((t) => t.id)).toEqual(['near', 'hazardous', 'modelled', 'impact'])
    expect(terms.find((t) => t.id === 'near')?.applies).toBe(true)
    expect(terms.find((t) => t.id === 'hazardous')?.applies).toBe(false)
    expect(terms.find((t) => t.id === 'modelled')?.applies).toBe(true)
    expect(terms.find((t) => t.id === 'impact')?.applies).toBe(false)
    const modelled = terms.find((t) => t.id === 'modelled')?.detail ?? ''
    expect(modelled).toMatch(/model/i)
    expect(modelled).not.toMatch(/will (hit|impact)/i)

    const zoozve = byId('sb:524522')
    const z = impactTerms(zoozve, riskEntryFor(neo, zoozve))
    expect(z.find((t) => t.id === 'hazardous')?.applies).toBe(true)
    expect(z.find((t) => t.id === 'modelled')?.applies).toBe(false)
  })
})
