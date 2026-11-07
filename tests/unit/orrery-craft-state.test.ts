/**
 * What the orrery says about a spacecraft (#93; spec Parts 8, 10, 16, 17). Built on
 * real Horizons fixtures (2026-11-05..07): Voyager 1 and 2, JWST, Earth.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { parseHorizonsVectors } from '@/lib/horizons'
import { describeCraft, earthState } from '@/lib/orrery/craftState'
import { jdFromDate } from '@/lib/orrery/kepler'
import type { OrreryTrack } from '@/schemas/orreryBodies'

function track(name: string, naifId: string, extra: Partial<OrreryTrack> = {}): OrreryTrack {
  const samples =
    parseHorizonsVectors(
      readFileSync(join(__dirname, 'fixtures', 'horizons', `${name}.txt`), 'utf8'),
    )?.samples ?? []
  return {
    id: `naif:${naifId}`,
    naifId,
    name,
    mission: 'test mission',
    category: 'spacecraft',
    group: 'deep-space',
    target: null,
    observedUntil: null,
    availableFrom: null,
    availableTo: null,
    fine: {
      start: samples[0]?.jd ?? 0,
      step: 0.5,
      samples: samples.flatMap((s) => [s.x, s.y, s.z, s.vx, s.vy, s.vz]),
    },
    coarse: null,
    ...extra,
  }
}

const JD = 2461350.5 // 2026-11-06 00:00 TDB
const earth = track('earth', '399', { category: 'planet', group: 'planet' })

describe('earthState', () => {
  it('uses Horizons for Earth where the payload covers the date', () => {
    expect(earthState(earth, JD).source).toBe('horizons')
  })

  it('falls back to the Kepler model outside it, and says so', () => {
    const s = earthState(earth, JD + 400)
    expect(s.source).toBe('kepler')
    expect(Math.hypot(s.position.x, s.position.y, s.position.z)).toBeCloseTo(1, 1)
  })

  it('uses the Kepler model when there is no Earth track at all', () => {
    expect(earthState(null, JD).source).toBe('kepler')
  })
})

describe('describeCraft', () => {
  it('Voyager 1: about 171 au from Earth, ~23.7 h of light, receding (Part 17)', () => {
    const d = describeCraft(track('voyager1', '-31', { observedUntil: '1992-04-24' }), earth, JD)
    expect(d).not.toBeNull()
    expect(d?.earthDistanceAu).toBeGreaterThan(170)
    expect(d?.earthDistanceAu).toBeLessThan(174)
    expect((d?.lightTimeFromEarthS ?? 0) / 3600).toBeGreaterThan(23)
    expect((d?.lightTimeFromEarthS ?? 0) / 3600).toBeLessThan(24.5)
    // Receding, at roughly its 17 km/s plus or minus Earth's 30 km/s orbital swing.
    expect(d?.rangeRateKmS).toBeDefined()
    expect(Math.abs(d?.rangeRateKmS ?? 0)).toBeLessThan(50)
  })

  it('Voyager 2 is farther from the Sun than 140 au', () => {
    const d = describeCraft(track('voyager2', '-32'), earth, JD)
    expect(d?.sunDistanceAu).toBeGreaterThan(140)
  })

  it('JWST sits about 1.5 million km from Earth, at L2', () => {
    const d = describeCraft(track('jwst', '-170', { group: 'l1' }), earth, JD)
    const km = (d?.earthDistanceAu ?? 0) * 149_597_870.7
    expect(km).toBeGreaterThan(1.0e6)
    expect(km).toBeLessThan(2.0e6)
  })

  it('labels the position as an ephemeris from JPL Horizons, never an observation', () => {
    const d = describeCraft(track('voyager1', '-31'), earth, JD)
    expect(d?.state.sourceType).toBe('ephemeris')
    expect(d?.state.sourceProvider).toMatch(/JPL Horizons/)
    expect(d?.state.referenceFrame).toMatch(/ecliptic J2000/)
    expect(d?.state.referenceCenter).toBe('Sun')
  })

  it('says a position past the tracking data is a prediction (Part 16)', () => {
    const d = describeCraft(track('voyager1', '-31', { observedUntil: '1992-04-24' }), earth, JD)
    expect(d?.predicted).toBe(true)
    expect(d?.state.confidenceReasons.join(' ')).toMatch(/prediction beyond tracking data/i)
    expect(d?.state.confidenceReasons.join(' ')).toMatch(/interpolated/i)
  })

  it('returns null outside the data rather than extrapolating', () => {
    expect(describeCraft(track('voyager1', '-31'), earth, JD + 30)).toBeNull()
  })

  it('works out the date from a calendar date', () => {
    expect(jdFromDate(new Date(Date.UTC(2026, 10, 6)))).toBe(JD)
  })
})
