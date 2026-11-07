/**
 * The close-approach layer (#92): objects placed around Earth in the Earth frame from the
 * trimmed live payload, hidden outside their samples or without a Horizons Earth, the
 * filters applied, the selected object's pass drawn.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'

import { AsteroidLayer, type EarthFrameView } from '@/components/orrery/three/asteroidLayer'
import {
  approachPathTimes,
  asteroidGeocentric,
  DEFAULT_NEO_FILTER,
  shortName,
} from '@/lib/orrery/asteroids'
import { earthFrameRadii } from '@/lib/orrery/earthFrame'
import { place3d } from '@/lib/orrery/scale'
import { AU_KM } from '@/lib/orrery/units'
import { OrreryTrackSchema } from '@/schemas/orreryBodies'
import { OrreryNeoSchema } from '@/schemas/orreryNeo'

const raw = JSON.parse(
  readFileSync(join(import.meta.dirname, 'fixtures/neo/orrery-neo-trim.json'), 'utf8'),
) as { neo: unknown; earth: unknown }
const neo = OrreryNeoSchema.parse(raw.neo)
const earth = OrreryTrackSchema.parse(raw.earth)
const toScene = (p: { x: number; y: number; z: number }) => {
  const v = place3d(p)
  return new Vector3(v.x, v.y, v.z)
}
const R = 0.048
const frame = (t: number): EarthFrameView => ({
  earth: new Vector3(1, 0, -0.3),
  radius: R,
  t,
  toScene,
})
const zoozve = neo.approaches.find((a) => a.id === 'sb:524522')
const jd = zoozve?.closeApproach.jd ?? 0

function layer() {
  const l = new AsteroidLayer()
  l.setApproaches(neo.approaches)
  l.setEarthTrack(earth)
  return l
}

describe('AsteroidLayer (#92)', () => {
  it('places each object at its Earth-frame distance once the frame is open', () => {
    const l = layer()
    l.place(jd, frame(1))
    const shown = l.visible()
    expect(shown.length).toBe(neo.approaches.length)
    for (const m of shown) {
      const a = neo.approaches.find((x) => x.id === m.key)
      if (!a) throw new Error(m.key)
      const g = asteroidGeocentric(a, earth, jd)
      const drawn = m.mesh.position.distanceTo(frame(1).earth)
      expect(drawn).toBeCloseTo(R * earthFrameRadii((g?.distAu ?? 0) * AU_KM), 9)
      // Clear of Earth's drawn disc.
      expect(drawn).toBeGreaterThan(R * 1.5)
    }
    expect(shown.find((m) => m.key === 'sb:524522')?.pha).toBe(true)
  })

  it('hides everything without a Horizons Earth, and outside the samples', () => {
    const l = layer()
    l.setEarthTrack(null)
    l.place(jd, frame(1))
    expect(l.visible()).toHaveLength(0)
    const m = layer()
    m.place(jd + 30, frame(1))
    expect(m.visible()).toHaveLength(0)
  })

  it('applies the filter but keeps the selected object', () => {
    const l = layer()
    l.setFilter({ ...DEFAULT_NEO_FILTER, hazardousOnly: true })
    l.place(jd, frame(1))
    expect(l.visible().map((m) => m.key)).toEqual(['sb:524522'])
    l.setSelected('sb:2026 UE2')
    l.place(jd, frame(1))
    expect(
      l
        .visible()
        .map((m) => m.key)
        .sort(),
    ).toEqual(['sb:2026 UE2', 'sb:524522'])
  })

  it("draws the selected object's whole sampled pass", () => {
    const l = layer()
    expect(l.pathPoints()).toBe(0)
    l.setSelected('sb:524522')
    l.place(jd, frame(1))
    expect(l.pathPoints()).toBe(161)
  })

  it('draws a daily-plus-3 h pass densely around closest approach (#136)', () => {
    const z = neo.approaches.find((a) => a.id === 'sb:524522')
    const fine = z?.fine
    if (!z || !fine) throw new Error('fixture lacks Zoozve')
    const n = fine.samples.length / 6
    const take = (idx: number[]) => idx.flatMap((i) => fine.samples.slice(i * 6, i * 6 + 6))
    const daily = Array.from({ length: Math.floor((n - 1) / 8) + 1 }, (_, k) => k * 8)
    const ca = Math.round((z.closeApproach.jd - fine.start) / fine.step)
    const near = Array.from({ length: 49 }, (_, k) => ca - 24 + k).filter((i) => i >= 0 && i < n)
    const split = {
      ...z,
      fine: { start: fine.start, step: 1, samples: take(daily) },
      close: {
        start: fine.start + (near[0] ?? 0) * fine.step,
        step: fine.step,
        samples: take(near),
      },
    }
    const l = new AsteroidLayer()
    l.setApproaches([split])
    l.setEarthTrack(earth)
    l.setSelected('sb:524522')
    l.place(jd, frame(1))
    expect(l.pathPoints()).toBe(approachPathTimes(split, 200).length)
    expect(l.pathPoints()).toBeGreaterThan(daily.length + 30)
  })
})

describe('shortName (#92)', () => {
  it("makes a label from JPL's full name", () => {
    expect(shortName('524522 Zoozve (2002 VE68)')).toBe('Zoozve')
    expect(shortName('       (2026 UE2)')).toBe('2026 UE2')
    expect(shortName('137108 (1999 AN10)')).toBe('137108 (1999 AN10)')
  })
})
