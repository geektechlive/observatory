/**
 * What the inspector shows for a planet (#91; spec Parts 8, 10, 16): a normalised object
 * and state, distances, light time, range rate and honest confidence reasons.
 */
import { describe, expect, it } from 'vitest'

import { jdFromDate } from '@/lib/orrery'
import { describePlanet, ORRERY_BODIES } from '@/lib/orrery/bodies'
import { OrbitalStateSchema, SpaceObjectSchema } from '@/lib/orrery/model'

const NOW = jdFromDate(new Date('2026-11-06T00:00:00Z'))

describe('ORRERY_BODIES (#91)', () => {
  it('lists the Sun and the eight planets, Sun outward, with NAIF ids', () => {
    expect(ORRERY_BODIES.map((b) => b.name)).toEqual([
      'Sun',
      'Mercury',
      'Venus',
      'Earth',
      'Mars',
      'Jupiter',
      'Saturn',
      'Uranus',
      'Neptune',
    ])
    expect(ORRERY_BODIES.find((b) => b.name === 'Mars')?.object.id).toBe('naif:499')
    for (const b of ORRERY_BODIES) expect(SpaceObjectSchema.safeParse(b.object).success).toBe(true)
  })
})

describe('describePlanet (#91)', () => {
  it('produces a valid Part 8 state labelled as a Kepler approximation', () => {
    const d = describePlanet('Mars', NOW)
    expect(OrbitalStateSchema.safeParse(d.state).success).toBe(true)
    expect(d.state.sourceType).toBe('kepler_approximation')
    expect(d.state.referenceFrame).toBe('ecliptic J2000')
    expect(d.state.sourceProvider).toMatch(/Table 1/)
  })

  it('says the outer planets are drawn about the solar-system barycentre', () => {
    expect(describePlanet('Jupiter', NOW).state.referenceCenter).toMatch(/barycentre/i)
    expect(describePlanet('Mars', NOW).state.referenceCenter).toBe('Sun')
  })

  it('gives distances from the Sun and Earth, light time and a range rate', () => {
    const d = describePlanet('Mars', NOW)
    expect(d.sunDistanceAu).toBeGreaterThan(1.3)
    expect(d.sunDistanceAu).toBeLessThan(1.7)
    expect(d.earthDistanceAu).toBeGreaterThan(0)
    expect(d.lightTimeFromEarthS).toBeGreaterThan(0)
    expect(d.rangeRateKmS).not.toBeNull()
  })

  it('has no Earth distance or range rate for Earth itself', () => {
    const d = describePlanet('Earth', NOW)
    expect(d.earthDistanceAu).toBeNull()
    expect(d.rangeRateKmS).toBeNull()
  })

  it('quotes JPL’s stated error as the confidence reason, and drops to low outside every table', () => {
    const d = describePlanet('Neptune', NOW)
    expect(d.state.confidenceReasons.join(' ')).toMatch(/10″/)
    const far = describePlanet('Neptune', jdFromDate(new Date('3500-01-01T00:00:00Z')))
    expect(far.state.confidence).toBe('low')
    expect(far.state.confidenceReasons.join(' ')).toMatch(/outside/i)
  })
})
