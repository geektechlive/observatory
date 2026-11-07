/**
 * Earth's neighbourhood (#92): L1 sits sunward of Earth at its frame distance, things
 * near Earth go into the frame and things far from it stay put, and nothing opens
 * without Horizons' Earth.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'

import { EarthNeighbourhood } from '@/components/orrery/three/earthNeighbourhood'
import { EARTH_FRAME_UNIT, earthFrameRadii, L1_DISTANCE_KM } from '@/lib/orrery/earthFrame'
import { stateAt } from '@/lib/orrery/ephemeris'
import { place3d } from '@/lib/orrery/scale'
import { OrreryTrackSchema } from '@/schemas/orreryBodies'

const raw = JSON.parse(
  readFileSync(join(import.meta.dirname, 'fixtures/neo/orrery-neo-trim.json'), 'utf8'),
) as { earth: unknown }
const earthTrack = OrreryTrackSchema.parse(raw.earth)
const toScene = (p: { x: number; y: number; z: number }) => {
  const v = place3d(p)
  return new Vector3(v.x, v.y, v.z)
}
const JD = earthTrack.fine ? earthTrack.fine.start + 30 : 0
const earthHelio = stateAt({ fine: earthTrack.fine, coarse: null }, JD)?.position ?? {
  x: 0,
  y: 0,
  z: 0,
}
const earthScene = toScene(earthHelio)

function open(n: EarthNeighbourhood) {
  return n.view(JD, earthScene, EARTH_FRAME_UNIT, 1, toScene)
}

describe('EarthNeighbourhood (#92)', () => {
  it('puts L1 sunward of Earth at its frame distance', () => {
    const n = new EarthNeighbourhood()
    n.setEarthTrack(earthTrack)
    n.place(JD, open(n))
    expect(n.l1.visible).toBe(true)
    const off = n.l1.position.clone().sub(earthScene)
    expect(off.length()).toBeCloseTo(EARTH_FRAME_UNIT * earthFrameRadii(L1_DISTANCE_KM), 6)
    // Pointing at the Sun (the scene origin).
    expect(off.normalize().dot(earthScene.clone().negate().normalize())).toBeGreaterThan(0.999)
  })

  it('moves near things into the frame and leaves far ones alone', () => {
    const n = new EarthNeighbourhood()
    n.setEarthTrack(earthTrack)
    const frame = open(n)
    const near = { x: earthHelio.x + 0.01, y: earthHelio.y, z: earthHelio.z }
    const far = { x: earthHelio.x + 0.3, y: earthHelio.y, z: earthHelio.z }
    expect(n.placeNear(near, frame, 0.1)?.distanceTo(earthScene)).toBeCloseTo(
      EARTH_FRAME_UNIT * earthFrameRadii(0.01 * 149_597_870.7),
      6,
    )
    expect(n.placeNear(far, frame, 0.1)).toBeNull()
  })

  it('stays closed without Horizons’ Earth, and hides L1 then', () => {
    const n = new EarthNeighbourhood()
    const frame = n.view(JD, earthScene, 0.048, 1, toScene)
    expect(frame.t).toBe(0)
    expect(n.coversEarth(JD)).toBe(false)
    n.place(JD, frame)
    expect(n.l1.visible).toBe(false)
  })

  it('hides the line and L1 with the Space weather switch', () => {
    const n = new EarthNeighbourhood()
    n.setEarthTrack(earthTrack)
    n.setSunLineVisible(false)
    n.place(JD, open(n))
    expect(n.l1.visible).toBe(false)
  })
})
