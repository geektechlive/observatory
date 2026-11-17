/**
 * #243: a tall time bar on a short phone stage must not push the Earth presets' camera out
 * of the open Earth frame (the satellites only show inside it). At 375 px the stage is
 * 360 px tall; with the bar covering ~150 px of it the fit ran away to 1,440 frame units.
 */
import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'

import { earthPresetView } from '@/components/orrery/three/framing'
import { EARTH_FRAME_OPEN_CAMERA, EARTH_FRAME_UNIT } from '@/lib/orrery/earthFrame'
import { ORBIT_PRESET_RADII } from '@/lib/orrery/satView'

const earth = new Vector3(1, 0, 0)
const sun = new Vector3(0, 0, 0)
const MAX = EARTH_FRAME_UNIT * EARTH_FRAME_OPEN_CAMERA.open * 0.95

function units(radii: number, barPx: number, w: number, h: number): number {
  const view = earthPresetView(earth, sun, w / h, EARTH_FRAME_UNIT * radii, (2 * barPx) / h, MAX)
  return view.position.distanceTo(earth) / EARTH_FRAME_UNIT
}

describe('Earth presets under a tall time bar (#243)', () => {
  it('keep the camera inside the open frame on a 375 px phone with a 160 px bar', () => {
    expect(units(ORBIT_PRESET_RADII, 160, 375, 360)).toBeLessThan(EARTH_FRAME_OPEN_CAMERA.open)
    expect(units(13.5, 160, 375, 360)).toBeLessThan(EARTH_FRAME_OPEN_CAMERA.open)
  })

  it('leave the usual framing alone when the bar is short', () => {
    expect(units(ORBIT_PRESET_RADII, 60, 1100, 800)).toBeCloseTo(23.1, 0)
    expect(units(13.5, 60, 375, 360)).toBeCloseTo(56.3, 0)
  })
})
