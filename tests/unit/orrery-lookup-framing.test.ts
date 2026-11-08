/**
 * The focus view for an object looked up at JPL (#145): the object with the Sun (and
 * Earth when it is near), all in the part of the stage left free, apart on screen. A
 * far visitor like 3I/ATLAS at 13 au used to fill the view with nothing around it.
 */
import { PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'

import { FILL, type FocusRoom, FOV, lookupFocusView } from '@/components/orrery/three/framing'
import { place3d } from '@/lib/orrery'

const scene = (p: { x: number; y: number; z: number }) => {
  const v = place3d(p)
  return new Vector3(v.x, v.y, v.z)
}
const FULL: FocusRoom = { x: 1, up: 1, down: 1 }
/** A desktop stage with the inspector drawer over its right 30%. */
const DRAWER: FocusRoom = { x: 0.7, up: 1, down: 0.8 }

/** Each point's NDC on the camera the view describes, x scaled to the aspect. */
function project(view: { position: Vector3; target: Vector3 }, aspect: number, pts: Vector3[]) {
  const camera = new PerspectiveCamera(FOV, aspect, 0.0001, 1e7)
  camera.updateProjectionMatrix()
  camera.position.copy(view.position)
  camera.lookAt(view.target)
  camera.updateMatrixWorld()
  return pts.map((p) => {
    const v = p.clone().project(camera)
    return { x: v.x, y: v.y, z: v.z }
  })
}

function minGap(ndc: { x: number; y: number }[], aspect: number): number {
  let min = Infinity
  for (let i = 0; i < ndc.length; i += 1) {
    for (let j = i + 1; j < ndc.length; j += 1) {
      const a = ndc[i]
      const b = ndc[j]
      if (!a || !b) continue
      min = Math.min(min, Math.hypot((a.x - b.x) * aspect, a.y - b.y))
    }
  }
  return min
}

function fits(ndc: { x: number; y: number; z: number }[], room: FocusRoom) {
  return ndc.every(
    (p) =>
      p.z < 1 &&
      Math.abs(p.x) <= room.x * FILL + 1e-6 &&
      p.y <= room.up * FILL + 1e-6 &&
      -p.y <= room.down * FILL + 1e-6,
  )
}

describe('lookupFocusView (#145)', () => {
  const sun = new Vector3()

  it('a far visitor (3I/ATLAS, 13 au) is framed with the Sun, well apart on screen', () => {
    const object = scene({ x: -8.4, y: 9.9, z: 1.4 })
    for (const aspect of [1.43, 0.46]) {
      const view = lookupFocusView(object, [sun], aspect, FULL)
      expect(view.target.distanceTo(object)).toBeLessThan(1e-9)
      const ndc = project(view, aspect, [object, sun])
      expect(fits(ndc, FULL)).toBe(true)
      expect(minGap(ndc, aspect)).toBeGreaterThan(0.5)
    }
  })

  it('a near-Earth object (Apophis, 0.76 au) shows Earth too, all three apart', () => {
    const object = scene({ x: 0.5, y: -0.55, z: 0.02 })
    const earth = scene({ x: 0.7, y: 0.7, z: 0 })
    const view = lookupFocusView(object, [sun, earth], 1.43, FULL)
    const ndc = project(view, 1.43, [object, sun, earth])
    expect(fits(ndc, FULL)).toBe(true)
    expect(minGap(ndc, 1.43)).toBeGreaterThan(0.3)
  })

  it('keeps everything in the part of the stage the inspector and time bar leave free', () => {
    const object = scene({ x: -8.4, y: 9.9, z: 1.4 })
    const earth = scene({ x: 0.7, y: 0.7, z: 0 })
    const view = lookupFocusView(object, [sun, earth], 1.43, DRAWER)
    expect(fits(project(view, 1.43, [object, sun, earth]), DRAWER)).toBe(true)
  })
})
