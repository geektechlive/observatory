/**
 * The Earth–Moon/L1 preset (#92): Earth in the middle, the Sun–Earth line running across
 * the stage so L1 and L2 sit to either side, the frame's whole neighbourhood in view
 * above the time bar, and the camera close enough that the Earth frame is fully open.
 */
import { PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'

import { earthPresetView, FILL, FOV, pointsExtent } from '@/components/orrery/three/framing'
import { EARTH_FRAME_OPEN_CAMERA, EARTH_FRAME_UNIT } from '@/lib/orrery/earthFrame'

const R = EARTH_FRAME_UNIT
const EXTENT = 13.5 * R // OrreryRenderer EARTH_PRESET_RADII
const earth = new Vector3(0.75, 0, -0.66).multiplyScalar(1.1)
const sun = new Vector3()

function cameraAt(view: { position: Vector3; target: Vector3 }, aspect: number) {
  const camera = new PerspectiveCamera(FOV, aspect, 0.001, 1e7)
  camera.position.copy(view.position)
  camera.lookAt(view.target)
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld()
  return camera
}

/** A ring and two poles at `r` around `c`: the neighbourhood the preset must hold. */
function neighbourhood(c: Vector3, r: number): Vector3[] {
  const out: Vector3[] = []
  for (let i = 0; i < 24; i += 1) {
    const a = (i / 24) * Math.PI * 2
    out.push(new Vector3(c.x + r * Math.cos(a), c.y, c.z + r * Math.sin(a)))
  }
  return out
}

describe('earthPresetView (#92)', () => {
  for (const aspect of [0.55, 1, 1.6, 2.4]) {
    it(`at aspect ${String(aspect)}: holds the neighbourhood, above the bar, frame open`, () => {
      const reserve = 0.3
      const view = earthPresetView(earth, sun, aspect, EXTENT, reserve)
      expect(view.target.distanceTo(earth)).toBeLessThan(1e-9)
      const camera = cameraAt(view, aspect)
      expect(pointsExtent(camera, neighbourhood(earth, EXTENT), reserve)).toBeLessThanOrEqual(
        FILL + 1e-3,
      )
      expect(view.position.distanceTo(earth) / R).toBeLessThanOrEqual(EARTH_FRAME_OPEN_CAMERA.open)
    })
  }

  it('runs the Sun–Earth line across the stage, so L1 and L2 sit to the sides', () => {
    const view = earthPresetView(earth, sun, 1.6, EXTENT, 0)
    const camera = cameraAt(view, 1.6)
    const toSun = sun
      .clone()
      .sub(earth)
      .normalize()
      .multiplyScalar(EXTENT * 0.9)
    const l1 = earth.clone().add(toSun).project(camera)
    const l2 = earth.clone().sub(toSun).project(camera)
    expect(Math.abs(l1.x - l2.x)).toBeGreaterThan(3 * Math.abs(l1.y - l2.y))
  })
})
