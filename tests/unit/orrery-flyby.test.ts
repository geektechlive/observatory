/**
 * Close passes between daily samples (#230). Europa Clipper flies past Earth on 3 Dec
 * 2026; JPL Horizons puts closest approach at 9,609 km from Earth's centre at 20:15 TDB.
 * Daily samples drawn by Hermite put it ~660 km under the surface. Fixtures: daily Clipper
 * and Earth samples from production /api/orrery-bodies, and one Horizons answer at 10-minute
 * steps over 3 Dec (both recorded 2026-11-14).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { parseHorizonsVectors } from '@/lib/horizons'
import { describeCraft } from '@/lib/orrery/craftState'
import { ENCOUNTER_STEP_DAYS, encounterWindow, roughRuns } from '@/lib/orrery/encounters'
import { stateAt } from '@/lib/orrery/ephemeris'
import type { OrreryTrack, SampledSpan } from '@/schemas/orreryBodies'

const dir = join(__dirname, 'fixtures', 'horizons')
const daily = JSON.parse(readFileSync(join(dir, 'clipper-flyby-daily.json'), 'utf8')) as {
  clipper: SampledSpan
  earth: SampledSpan
}

/** The 10-minute Horizons answer as the job stores it: [x, y, z, vx, vy, vz] per sample. */
function denseSpan(): SampledSpan {
  const parsed = parseHorizonsVectors(readFileSync(join(dir, 'clipper-flyby-10m.txt'), 'utf8'))
  const samples = parsed?.samples ?? []
  const first = samples[0]
  const second = samples[1]
  if (!first || !second) throw new Error('fixture has no samples')
  return {
    start: first.jd,
    step: second.jd - first.jd,
    samples: samples.flatMap((s) => [s.x, s.y, s.z, s.vx, s.vy, s.vz]),
  }
}

const AU_KM = 149_597_870.7
const EARTH_RADIUS_KM = 6_371
const JD_DEC_3 = 2461377.5
/** Horizons' closest approach, 2026-12-03 20:15 TDB. */
const JD_CLOSEST = JD_DEC_3 + (20 * 60 + 15) / 1440

function clipper(extra: Partial<OrreryTrack> = {}): OrreryTrack {
  return {
    id: 'naif:-159',
    naifId: '-159',
    name: 'Europa Clipper',
    mission: 'Europa Clipper (NASA/JPL)',
    category: 'spacecraft',
    group: 'mission',
    target: null,
    observedUntil: null,
    availableFrom: null,
    availableTo: null,
    fine: daily.clipper,
    coarse: null,
    ...extra,
  }
}

const earth: OrreryTrack = {
  ...clipper(),
  id: 'naif:399',
  naifId: '399',
  name: 'Earth',
  category: 'planet',
  fine: daily.earth,
}

/** The smallest distance from Earth's centre over 3 Dec, every 5 minutes, km. */
function closestKm(track: OrreryTrack): { km: number; jd: number } {
  let best = { km: Infinity, jd: 0 }
  for (let m = 0; m <= 1440; m += 5) {
    const jd = JD_DEC_3 + m / 1440
    const c = stateAt(track, jd)
    const e = stateAt(earth, jd)
    if (!c || !e) continue
    const km =
      Math.hypot(
        c.position.x - e.position.x,
        c.position.y - e.position.y,
        c.position.z - e.position.z,
      ) * AU_KM
    if (km < best.km) best = { km, jd }
  }
  return best
}

describe('Europa Clipper past Earth, 3 Dec 2026 (#230)', () => {
  it('daily samples alone draw it inside the Earth: why the dense span exists', () => {
    expect(closestKm(clipper()).km).toBeLessThan(EARTH_RADIUS_KM)
  })

  it('with the 10-minute span it passes 9,609 km from Earth’s centre at about 20:15', () => {
    const best = closestKm(clipper({ dense: [denseSpan()] }))
    expect(best.km).toBeGreaterThan(EARTH_RADIUS_KM)
    expect(Math.abs(best.km - 9_609)).toBeLessThan(100)
    expect(Math.abs(best.jd - JD_CLOSEST) * 1440).toBeLessThanOrEqual(10)
  })

  it('falls back to the daily samples outside the dense span', () => {
    const track = clipper({ dense: [denseSpan()] })
    const jd = JD_DEC_3 + 5
    expect(stateAt(track, jd)).toEqual(stateAt(clipper(), jd))
  })
})

describe('rough stretches of a daily span (#230)', () => {
  it('finds the flyby as one short run, and nothing for Earth', () => {
    const runs = roughRuns(daily.clipper)
    expect(runs).toHaveLength(1)
    const run = runs[0]
    expect(run?.start).toBeLessThanOrEqual(JD_CLOSEST)
    expect(run?.end).toBeGreaterThanOrEqual(JD_CLOSEST)
    expect(run?.worstKm).toBeGreaterThan(10_000)
    expect(roughRuns(daily.earth)).toEqual([])
  })

  it('asks for a 3-day window at 10 minutes around the worst of the run', () => {
    const run = roughRuns(daily.clipper)[0]
    if (!run) throw new Error('no run')
    const w = encounterWindow(run, daily.clipper)
    expect(w).not.toBeNull()
    expect(w?.stop).toBeCloseTo((w?.start ?? 0) + 3, 9)
    expect(w?.start).toBeLessThan(JD_CLOSEST)
    expect(w?.stop).toBeGreaterThan(JD_CLOSEST)
    expect(ENCOUNTER_STEP_DAYS * 1440).toBeCloseTo(10, 9)
  })

  it('asks for nothing when the run is longer than a pass (an orbiter, like BepiColombo at Mercury)', () => {
    expect(
      encounterWindow({ start: 0, end: 20, worstKm: 50_000, worstJd: 10 }, daily.clipper),
    ).toBeNull()
  })
})

describe('what the inspector says through a close pass (#230)', () => {
  it('names the 10-minute samples when they cover the moment', () => {
    const d = describeCraft(clipper({ dense: [denseSpan()] }), earth, JD_CLOSEST)
    expect(d?.resolution).toBe('dense')
    expect(d?.state.confidence).toBe('high')
    expect(d?.state.accuracyDescription).toMatch(/10-minute/)
  })

  it('drops confidence and says why when only daily samples cover a close pass', () => {
    const d = describeCraft(clipper(), earth, JD_CLOSEST)
    expect(d?.resolution).toBe('fine')
    expect(d?.state.confidence).toBe('medium')
    expect(d?.state.accuracyDescription).toMatch(/close pass/)
    expect(d?.state.accuracyDescription).not.toMatch(/within a few km/)
  })

  it('keeps the few-km claim on a smooth stretch', () => {
    const d = describeCraft(clipper(), earth, JD_DEC_3 - 4)
    expect(d?.state.confidence).toBe('high')
    expect(d?.state.accuracyDescription).toMatch(/within a few km/)
  })
})
