/**
 * The looked-up object's layer (#145): one marker on its Horizons samples, hidden where
 * none cover the date, and its orbit line through the scene's scale.
 */
import { Vector3 } from 'three'
import { describe, expect, it } from 'vitest'

import { LookupLayer } from '@/components/orrery/three/lookupLayer'
import { stateAt } from '@/lib/orrery/ephemeris'
import { lookupOrbit } from '@/lib/orrery/lookupTrack'
import { place3d } from '@/lib/orrery/scale'
import type { SampledSpan } from '@/schemas/orreryBodies'

const toScene = (p: { x: number; y: number; z: number }) => {
  const v = place3d(p)
  return new Vector3(v.x, v.y, v.z)
}
const linear = (p: { x: number; y: number; z: number }) =>
  new Vector3(p.x * 10, p.z * 10, -p.y * 10)

/** A circular orbit at 1.2 au in the ecliptic, sampled daily with velocities. */
function circle(startJd: number, n: number): SampledSpan {
  const a = 1.2
  const w = Math.sqrt(0.01720209895 ** 2 / a ** 3)
  const samples: number[] = []
  for (let i = 0; i < n; i += 1) {
    const th = w * i
    samples.push(
      a * Math.cos(th),
      a * Math.sin(th),
      0,
      -a * w * Math.sin(th),
      a * w * Math.cos(th),
      0,
    )
  }
  return { start: startJd, step: 1, samples }
}

const START = 2461000.5
const fine = circle(START, 200)
const data = {
  key: 'lookup:20099942',
  label: 'Apophis',
  fine,
  orbit: lookupOrbit(fine, START + 100),
}

describe('LookupLayer (#145)', () => {
  it('places the marker on its samples and draws its orbit through the scene scale', () => {
    const layer = new LookupLayer()
    layer.set(data)
    layer.place(START + 50, toScene, 'exaggerated')
    const s = stateAt({ fine, coarse: null }, START + 50)
    const want = toScene(s?.position ?? { x: 0, y: 0, z: 0 })
    expect(layer.marker.visible).toBe(true)
    expect(layer.position('lookup:20099942')?.distanceTo(want)).toBeLessThan(1e-9)
    // A closed loop: every orbit point, then the first again.
    expect(layer.pathPoints()).toBe((data.orbit?.points.length ?? 0) + 1)
    expect(layer.labelled()?.label).toBe('Apophis')
  })

  it('hides it where no sample covers the date: never extrapolated', () => {
    const layer = new LookupLayer()
    layer.set(data)
    layer.place(START - 3, toScene, 'exaggerated')
    expect(layer.marker.visible).toBe(false)
    expect(layer.position('lookup:20099942')).toBeNull()
    expect(layer.pathPoints()).toBe(0)
    expect(layer.labelled()).toBeNull()
  })

  it('rebuilds the line when the scale mode changes', () => {
    const layer = new LookupLayer()
    layer.set(data)
    layer.place(START + 50, toScene, 'exaggerated')
    const a = layer.path.geometry.getAttribute('position').getX(0)
    layer.place(START + 50, linear, 'proportional')
    const b = layer.path.geometry.getAttribute('position').getX(0)
    expect(b).not.toBeCloseTo(a, 3)
  })

  it('moves into the Earth frame when that says so, and only for its own key', () => {
    const layer = new LookupLayer()
    layer.set(data)
    layer.place(START + 50, toScene, 'exaggerated')
    layer.placeNear(() => new Vector3(9, 9, 9))
    expect(layer.position('lookup:20099942')?.x).toBe(9)
    expect(layer.has('lookup:20099942')).toBe(true)
    expect(layer.has('lookup:1')).toBe(false)
  })

  it('clearing it removes marker, line and label', () => {
    const layer = new LookupLayer()
    layer.set(data)
    layer.place(START + 50, toScene, 'exaggerated')
    layer.set(null)
    layer.place(START + 50, toScene, 'exaggerated')
    expect(layer.marker.visible).toBe(false)
    expect(layer.pathPoints()).toBe(0)
    expect(layer.has('lookup:20099942')).toBe(false)
  })
})
