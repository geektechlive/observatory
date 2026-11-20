/**
 * The fly-in's settings from the page's data (#261): a craft with a model and ESA DISCOS
 * dimensions gets the true-scale view; its scene unit is half its body's largest real size;
 * it carries the model's axis and its surroundings.
 */
import { describe, expect, it } from 'vitest'

import { flyInOptions } from '@/components/orrery/flyIn'
import type { OrreryTrack } from '@/schemas/orreryBodies'
import type { Discos } from '@/schemas/spaceTrack'

const JD = 2_461_000.5

function track(naifId: string, at: [number, number, number]): OrreryTrack {
  const samples: number[] = []
  for (let i = 0; i <= 20; i += 1) samples.push(...at, 0, 0, 0)
  return {
    id: `naif:${naifId}`,
    naifId,
    name: naifId,
    mission: naifId,
    category: 'spacecraft',
    group: 'deep',
    target: naifId,
    observedUntil: null,
    availableFrom: null,
    availableTo: null,
    fine: { start: JD - 10, step: 1, samples },
    coarse: null,
  } as unknown as OrreryTrack
}

const dims = (
  o: Partial<Record<'widthM' | 'heightM' | 'depthM' | 'diameterM' | 'spanM', number | null>>,
) => ({
  widthM: null,
  heightM: null,
  depthM: null,
  diameterM: null,
  spanM: null,
  ...o,
})

const discos = {
  generatedAt: '',
  citation: '',
  craft: { '-96': dims({ diameterM: 2.3, heightM: 3, spanM: 3 }) },
  satellites: {},
  missing: [],
} as unknown as Discos

const base = {
  tracks: [track('-96', [0.046, 0, 0])],
  moons: [],
  discos,
  jdNow: () => JD,
}

describe('flyInOptions (#261)', () => {
  it('carries Parker’s real size from DISCOS: a 3 m body, 3 m across', () => {
    const o = flyInOptions({ ...base, key: 'naif:-96' })
    expect(o?.size).toEqual({ bodyM: 3, spanM: 3 })
  })

  it('carries the model’s axis and Parker’s surroundings at the clock’s date', () => {
    const o = flyInOptions({ ...base, key: 'naif:-96' })
    expect(o?.axis).toHaveLength(3)
    const s = o?.surroundings()
    expect(s?.jd).toBe(JD)
    expect(s?.bodies.find((b) => b.name === 'Sun')?.relKm[0]).toBeLessThan(0)
  })

  it('gives no fly-in to a satellite, a craft without DISCOS sizes, or one without a model', () => {
    expect(flyInOptions({ ...base, key: 'sat:25544' })).toBeUndefined()
    expect(flyInOptions({ ...base, key: 'naif:-96', discos: null })).toBeUndefined()
    expect(
      flyInOptions({ ...base, key: 'naif:-999', tracks: [track('-999', [1, 0, 0])] }),
    ).toBeUndefined()
  })

  it('gives no fly-in on a date outside the craft’s data (no Sun to light it by)', () => {
    expect(flyInOptions({ ...base, key: 'naif:-96', jdNow: () => JD + 400 })).toBeUndefined()
  })
})
