/**
 * A very close pass drawn from a minute-scale span (#142). 2026 TP128 passed 7,490 km
 * from Earth's centre (JPL CAD) on 15 October 2026; its 3 h samples drew that 6.8%
 * short. The fixture holds the refresh job's 3 h span, a 10-minute Horizons span over
 * ±6 h of closest approach (the request the job now makes), and Horizons' Earth.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  approachPathTimes,
  asteroidGeocentric,
  closestApproachFromSamples,
} from '@/lib/orrery/asteroids'
import type { OrreryTrack, SampledSpan } from '@/schemas/orreryBodies'
import type { OrreryApproach } from '@/schemas/orreryNeo'

const AU_KM = 149_597_870.7
const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'neo', 'tp128-pass.json'), 'utf8'),
) as { approach: OrreryApproach; closest: SampledSpan; earth: OrreryTrack }
const cadKm = fixture.approach.closeApproach.distAu * AU_KM
const withClosest = { ...fixture.approach, closest: fixture.closest } as OrreryApproach

describe('a very close pass (#142)', () => {
  it('without the minute-scale span, the 3 h samples draw TP128 over 5% short', () => {
    const c = closestApproachFromSamples(fixture.approach, fixture.earth)
    expect(((c?.distAu ?? 0) * AU_KM - cadKm) / cadKm).toBeLessThan(-0.05)
  })

  it('draws the closest distance within 1% of JPL CAD', () => {
    const c = closestApproachFromSamples(withClosest, fixture.earth)
    expect(Math.abs(((c?.distAu ?? 0) * AU_KM - cadKm) / cadKm)).toBeLessThan(0.01)
    // At CAD's own time too.
    const g = asteroidGeocentric(withClosest, fixture.earth, fixture.approach.closeApproach.jd)
    expect(Math.abs(((g?.distAu ?? 0) * AU_KM - cadKm) / cadKm)).toBeLessThan(0.01)
  })

  it('places its drawn pass on the minute-scale samples around closest approach', () => {
    const times = approachPathTimes(withClosest, 200)
    const s = fixture.closest
    const end = s.start + (s.samples.length / 6 - 1) * s.step
    const inside = times.filter((t) => t >= s.start && t <= end)
    expect(inside.length).toBe(s.samples.length / 6)
    expect(times.length).toBeLessThanOrEqual(200)
    expect([...times].sort((a, b) => a - b)).toEqual(times)
  })
})
