/**
 * What each orrery preset shows (#91): Inner fills the stage with Mars's orbit and keeps
 * Jupiter's off it; Outer spans Jupiter to Neptune; Heliosphere reaches Voyager 1. Checked
 * at a desktop stage's aspect and two phone ones, with perspective, as three projects.
 */
import { PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'

import {
  type FocusPreset,
  FOV,
  framePreset,
  ringExtent,
  ringMinReach,
} from '@/components/orrery/three/framing'
import { place3d } from '@/lib/orrery'

const toScene = (au: number) => Math.hypot(...Object.values(place3d({ x: au, y: 0, z: 0 })))
/** 1920x1080 and 1440x900 desktop stages, the 390x844 phone stage, a narrow portrait. */
const ASPECTS = [1.55, 1.43, 0.8, 0.46]

function cameraFor(preset: FocusPreset, aspect: number) {
  const camera = new PerspectiveCamera(FOV, aspect, 0.001, 1e7)
  camera.updateProjectionMatrix()
  camera.position.copy(framePreset(preset, aspect, toScene))
  camera.lookAt(new Vector3(0, 0, 0))
  camera.updateMatrixWorld()
  return camera
}

/** Perihelion and aphelion, au (JPL Table 1 a and e, rounded). */
const ORBIT = {
  Mercury: [0.307, 0.467],
  Mars: [1.381, 1.666],
  Jupiter: [4.95, 5.46],
  Neptune: [29.8, 30.4],
} as const

describe('framePreset (#91)', () => {
  for (const aspect of ASPECTS) {
    describe(`aspect ${String(aspect)}`, () => {
      it('Inner: Mars’s orbit fills most of the view', () => {
        const cam = cameraFor('inner', aspect)
        expect(ringExtent(cam, toScene(ORBIT.Mars[1]))).toBeGreaterThan(0.75)
        expect(ringExtent(cam, toScene(ORBIT.Mars[1]))).toBeLessThanOrEqual(0.9)
      })

      // On a very tall, narrow stage (0.46) filling the width with Mars leaves room above
      // and below, so Jupiter's orbit shows there; the real phone stage is about 0.8.
      if (aspect >= 0.8) {
        it('Inner: every point of Jupiter’s orbit is off screen', () => {
          const cam = cameraFor('inner', aspect)
          expect(ringMinReach(cam, toScene(ORBIT.Jupiter[0]))).toBeGreaterThan(1)
        })
      }

      it('Outer: Neptune near the edge, Jupiter well inside', () => {
        const cam = cameraFor('outer', aspect)
        expect(ringExtent(cam, toScene(ORBIT.Neptune[1]))).toBeGreaterThan(0.75)
        expect(ringExtent(cam, toScene(ORBIT.Neptune[1]))).toBeLessThanOrEqual(0.9)
        expect(ringExtent(cam, toScene(ORBIT.Jupiter[1]))).toBeLessThan(0.75)
      })

      it('Heliosphere: Voyager 1’s 172 au is in view, Neptune inside it', () => {
        const cam = cameraFor('heliosphere', aspect)
        expect(ringExtent(cam, toScene(172))).toBeLessThan(0.9)
        expect(ringExtent(cam, toScene(ORBIT.Neptune[1]))).toBeLessThan(
          ringExtent(cam, toScene(172)),
        )
      })

      it('Sun: Mercury’s orbit fills the view', () => {
        const cam = cameraFor('sun', aspect)
        expect(ringExtent(cam, toScene(ORBIT.Mercury[1]))).toBeGreaterThan(0.75)
      })
    })
  }
})
