/**
 * Out-of-plane stalks (#93): the classic orrery cue for how far a craft sits north or
 * south of the ecliptic. A thin line from the craft to the plane with a tick where it
 * lands; dashed when the craft is south. Only for craft more than 1 au off the plane.
 */
import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'

import { DEFAULT_CRAFT_FILTER } from '@/components/orrery/craftFilter'
import { CraftLayer } from '@/components/orrery/three/craftLayer'
import { place3d } from '@/lib/orrery/scale'
import type { OrreryTrack } from '@/schemas/orreryBodies'

const JD = 2461350.5
const toScene = (p: { x: number; y: number; z: number }) => {
  const s = place3d(p)
  return new Vector3(s.x, s.y, s.z)
}

/** A track sitting still at `pos` (au) around JD. */
function track(
  naifId: string,
  group: OrreryTrack['group'],
  pos: [number, number, number],
): OrreryTrack {
  const sample = [...pos, 0, 0, 0]
  return {
    id: `naif:${naifId}`,
    naifId,
    name: naifId,
    mission: 'test',
    category: 'spacecraft',
    group,
    target: null,
    observedUntil: null,
    availableFrom: null,
    availableTo: null,
    fine: { start: JD - 1, step: 1, samples: [...sample, ...sample, ...sample] },
    coarse: null,
  }
}

function layer() {
  const l = new CraftLayer(toScene)
  l.setTracks([
    track('-31', 'deep-space', [-32.2, -137.1, 99.2]), // Voyager 1, north
    track('-32', 'deep-space', [40.0, -105.7, -89.9]), // Voyager 2, south
    track('-96', 'mission', [0.2, 0.15, 0.01]), // Parker, in the plane
  ])
  l.place(JD, 0.02)
  return l
}

describe('CraftLayer stalks (#93)', () => {
  it('draws a stalk from a craft well north of the plane down to it, solid', () => {
    const s = layer().stalkFor('naif:-31')
    expect(s?.visible).toBe(true)
    expect(s?.south).toBe(false)
    const top = toScene({ x: -32.2, y: -137.1, z: 99.2 })
    expect(s?.top.distanceTo(top)).toBeLessThan(1e-6)
    // The foot is the craft's point straight down on the ecliptic (scene y = 0).
    expect(s?.foot.y).toBe(0)
    expect(s?.foot.x).toBeCloseTo(top.x, 9)
    expect(s?.foot.z).toBeCloseTo(top.z, 9)
  })

  it('marks a craft south of the plane with a dashed stalk', () => {
    const s = layer().stalkFor('naif:-32')
    expect(s?.visible).toBe(true)
    expect(s?.south).toBe(true)
  })

  it('draws no stalk for a craft within 1 au of the plane', () => {
    expect(layer().stalkFor('naif:-96')?.visible).toBe(false)
  })

  it('hides a stalk with its craft, and all of them with the Orbits switch', () => {
    const l = layer()
    l.setFilter({ ...DEFAULT_CRAFT_FILTER, 'deep-space': false })
    l.place(JD, 0.02)
    expect(l.stalkFor('naif:-31')?.visible).toBe(false)
    l.setFilter(DEFAULT_CRAFT_FILTER)
    l.place(JD, 0.02)
    expect(l.stalkFor('naif:-31')?.visible).toBe(true)
    l.setStalksVisible(false)
    expect(l.stalks.visible).toBe(false)
  })

  it('hides the stalk when the craft has no data at the date', () => {
    const l = layer()
    l.place(JD + 30, 0.02)
    expect(l.stalkFor('naif:-31')?.visible).toBe(false)
  })
})
