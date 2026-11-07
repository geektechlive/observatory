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
  frameView,
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

describe('Heliosphere holds the deep-space craft in 3D (#93)', () => {
  // Heliocentric ecliptic J2000 au, from JPL Horizons on 2026-11-06. Voyager 2 is 90 au
  // south of the ecliptic, Voyager 1 99 au north: a 200 au ring alone missed Voyager 2.
  const CRAFT = {
    'Voyager 1': { x: -32.2, y: -137.1, z: 99.2 },
    'Voyager 2': { x: 40.0, y: -105.7, z: -89.9 },
    'New Horizons': { x: 63.8, y: -17.5, z: 2.4 },
  }
  const points = Object.values(CRAFT).map((p) => {
    const s = place3d(p)
    return new Vector3(s.x, s.y, s.z)
  })
  /** Share of the view's height the time bar covers at the bottom (about 100 of 680 px). */
  const RESERVE = 0.3

  /** A camera placed as frameView says, at a stage aspect. */
  function viewAt(aspect: number) {
    const view = frameView('heliosphere', aspect, toScene, { points, bottomReserveNdc: RESERVE })
    const camera = new PerspectiveCamera(FOV, aspect, 0.001, 1e7)
    camera.updateProjectionMatrix()
    camera.position.copy(view.position)
    camera.lookAt(view.target)
    camera.updateMatrixWorld()
    return { camera, view }
  }
  /** Screen position in px-like units (NDC x scaled by aspect, so distances are true). */
  const screen = (p: Vector3, camera: PerspectiveCamera, aspect: number) => {
    const v = p.clone().project(camera)
    return { x: v.x * aspect, y: v.y }
  }
  const NEPTUNE = Array.from({ length: 72 }, (_, i) => {
    const a = (i / 72) * Math.PI * 2
    const r = toScene(ORBIT.Neptune[1])
    return new Vector3(r * Math.cos(a), 0, r * Math.sin(a))
  })

  for (const aspect of [1.55, 1.43, 0.8]) {
    it(`at aspect ${String(aspect)}: every craft and Neptune's orbit in view, above the time bar`, () => {
      const { camera } = viewAt(aspect)
      for (const p of [...points, ...NEPTUNE]) {
        const v = p.clone().project(camera)
        expect(v.z).toBeLessThan(1)
        expect(Math.abs(v.x)).toBeLessThanOrEqual(0.9)
        expect(v.y).toBeLessThanOrEqual(0.9)
        // Above the time bar: NDC -1 is the stage's bottom edge.
        expect(v.y).toBeGreaterThanOrEqual(-1 + RESERVE)
      }
    })

    it(`at aspect ${String(aspect)}: a low view, so north and south of the plane read as up and down`, () => {
      const { view } = viewAt(aspect)
      const d = view.position.clone().sub(view.target)
      const elevation = (Math.asin(d.y / d.length()) * 180) / Math.PI
      expect(elevation).toBeGreaterThanOrEqual(15)
      expect(elevation).toBeLessThanOrEqual(25)
      // Aimed at the framed objects, not the Sun, so the frame is used.
      expect(view.target.length()).toBeGreaterThan(0)
    })

    it(`at aspect ${String(aspect)}: Voyager 1 reads far from the Sun, beyond Neptune's orbit`, () => {
      const { camera } = viewAt(aspect)
      const sun = screen(new Vector3(), camera, aspect)
      const gap = (p: Vector3) => {
        const s = screen(p, camera, aspect)
        return Math.hypot(s.x - sun.x, s.y - sun.y)
      }
      const neptuneNearest = Math.min(...NEPTUNE.map(gap))
      const v1 = points[0] ?? new Vector3()
      expect(gap(v1)).toBeGreaterThan(neptuneNearest)
    })
  }
})
