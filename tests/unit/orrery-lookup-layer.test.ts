/**
 * The looked-up object's layer (#145): one marker on its Horizons samples, hidden where
 * none cover the date, and its orbit line through the scene's scale.
 */
import { type BufferAttribute, Line, Line3, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'

import { EarthNeighbourhood } from '@/components/orrery/three/earthNeighbourhood'
import { LookupLayer, lookupMarkerRadius } from '@/components/orrery/three/lookupLayer'
import { EARTH_FRAME_UNIT } from '@/lib/orrery/earthFrame'
import { stateAt } from '@/lib/orrery/ephemeris'
import { lookupOrbit } from '@/lib/orrery/lookupTrack'
import { place3d } from '@/lib/orrery/scale'
import type { OrreryTrack, SampledSpan } from '@/schemas/orreryBodies'

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
  designation: '99942',
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
    layer.placeNear({
      t: 1,
      earthTrack: null,
      maxAu: 0.1,
      earth: new Vector3(),
      radius: EARTH_FRAME_UNIT,
      at: () => new Vector3(9, 9, 9),
    })
    expect(layer.position('lookup:20099942')?.x).toBe(9)
    expect(layer.has('lookup:20099942')).toBe(true)
    expect(layer.has('lookup:1')).toBe(false)
  })

  it('hides marker, line and label while its twin in the comet data is drawn (#99)', () => {
    const layer = new LookupLayer()
    layer.set(data)
    layer.place(START + 50, toScene, 'exaggerated', true)
    expect(layer.marker.visible).toBe(false)
    expect(layer.pathPoints()).toBe(0)
    expect(layer.labelled()).toBeNull()
    expect(layer.position('lookup:20099942')).toBeNull()
    // Still placed: the camera frames the twin from where the samples put it.
    expect(layer.helioNow()).not.toBeNull()
    layer.place(START + 50, toScene, 'exaggerated', false)
    expect(layer.marker.visible).toBe(true)
  })

  it('names the close approach that is the same object, by designation (#216)', () => {
    const layer = new LookupLayer()
    expect(layer.approachKey()).toBeNull()
    // The close approaches are keyed `sb:<des>`: the number once numbered, else the
    // provisional designation, as SBDB's primary designation is.
    layer.set({ ...data, designation: '2026 VQ11' })
    expect(layer.approachKey()).toBe('sb:2026 VQ11')
    layer.set({ ...data, designation: '524522' })
    expect(layer.approachKey()).toBe('sb:524522')
    layer.set({ ...data, designation: null })
    expect(layer.approachKey()).toBeNull()
  })

  describe('marker size on screen (#153)', () => {
    const SUN_FLOOR_PX = 10
    /** Scene units per px at a camera distance: 1440×900 at the orrery's 45° field. */
    const unitsPerPx = (depth: number) => (2 * Math.tan((22.5 * Math.PI) / 180) * depth) / 900
    it.each([0.05, 0.2, 1, 4, 40, 400])(
      'holds 3.5 to 5 px with the camera %s units away, never planet-sized',
      (depth) => {
        const px = lookupMarkerRadius(unitsPerPx(depth)) / unitsPerPx(depth)
        expect(px).toBeGreaterThanOrEqual(3.5 - 1e-9)
        expect(px).toBeLessThanOrEqual(5 + 1e-9)
        expect(px).toBeLessThan(SUN_FLOOR_PX)
      },
    )
  })

  describe('a pass near Earth through the Earth frame (#151)', () => {
    // Apophis on 13 April 2029: 38,000 km from Earth's centre at about 7.4 km/s. Earth on
    // a circular 1 au orbit, sampled daily for ±30 days; the object is Earth plus a
    // straight relative path, sampled every 2 days as /api/trajectory does for a lookup.
    const CA = 2462240.4 // 2029-04-13 21:46 TDB
    const AU = 149_597_870.7
    const W = 0.01720209895
    const earthAt = (jd: number) => {
      const th = W * (jd - CA)
      return {
        p: { x: Math.cos(th), y: Math.sin(th), z: 0 },
        v: { x: -W * Math.sin(th), y: W * Math.cos(th), z: 0 },
      }
    }
    const missAu = 38_000 / AU
    const vRel = (7.4 * 86_400) / AU // au/day, along x; the miss along z
    const objectAt = (jd: number) => {
      const e = earthAt(jd)
      return {
        p: { x: e.p.x + vRel * (jd - CA), y: e.p.y, z: missAu },
        v: { x: e.v.x + vRel, y: e.v.y, z: 0 },
      }
    }
    const span = (start: number, step: number, n: number, f: typeof earthAt): SampledSpan => {
      const samples: number[] = []
      for (let i = 0; i < n; i += 1) {
        const { p, v } = f(start + i * step)
        samples.push(p.x, p.y, p.z, v.x, v.y, v.z)
      }
      return { start, step, samples }
    }
    const earthTrack = {
      fine: span(Math.floor(CA) - 29.5, 1, 61, earthAt),
      coarse: null,
    } as unknown as OrreryTrack
    const flyby = span(Math.floor(CA) - 365.5, 2, 366, objectAt)
    const apophis = {
      key: 'lookup:20099942',
      label: 'Apophis',
      designation: '99942',
      fine: flyby,
      orbit: lookupOrbit(flyby, flyby.start + 365),
    }

    /** The open frame around Earth as drawn at `jd`, and the layer placed in it. */
    function placeAt(layer: LookupLayer, jd: number, t = 1) {
      const near = new EarthNeighbourhood()
      near.setEarthTrack(earthTrack)
      const earth = toScene(earthAt(jd).p)
      const frame = near.view(jd, earth, EARTH_FRAME_UNIT, t, toScene)
      layer.place(jd, toScene, 'exaggerated')
      layer.placeNear({
        t: frame.t,
        earthTrack,
        maxAu: 0.1,
        earth: frame.earth,
        radius: frame.radius,
        at: (helio, when) => near.placeNearAt(helio, when, frame, 0.1),
      })
      return earth
    }

    /** Every drawn segment of the layer's lines, scene units. */
    function segments(layer: LookupLayer): [Vector3, Vector3][] {
      const out: [Vector3, Vector3][] = []
      for (const line of Object.values(layer).filter((v): v is Line => v instanceof Line)) {
        if (!line.visible) continue
        const attr = line.geometry.getAttribute('position')
        const n = line.geometry.drawRange.count
        for (let i = 0; i + 1 < n; i += 1) {
          out.push([
            new Vector3(attr.getX(i), attr.getY(i), attr.getZ(i)),
            new Vector3(attr.getX(i + 1), attr.getY(i + 1), attr.getZ(i + 1)),
          ])
        }
      }
      return out
    }
    const offLine = (layer: LookupLayer) => {
      const p = layer.marker.position
      return Math.min(
        ...segments(layer).map(([a, b]) =>
          new Line3(a, b).closestPointToPoint(p, true, new Vector3()).distanceTo(p),
        ),
      )
    }

    // Inside 0.1 au (±23 days at 7.4 km/s); past it the dot is on the true-scale loop.
    it.each([-20, -3, -0.4, -0.01, 0, 0.05, 1, 6, 20])(
      'the dot lies on its line %s days from closest approach',
      (days) => {
        const layer = new LookupLayer()
        layer.set(apophis)
        placeAt(layer, CA + days)
        expect(layer.marker.visible).toBe(true)
        // A thousandth of the frame's Earth radius: on the line, not near it.
        expect(offLine(layer)).toBeLessThan(EARTH_FRAME_UNIT * 1e-3)
      },
    )

    it('draws no true-scale line through the open frame', () => {
      const layer = new LookupLayer()
      layer.set(apophis)
      const earth = placeAt(layer, CA)
      const attr = layer.path.geometry.getAttribute('position')
      // The loop's points within 0.1 au of Earth are left to the frame's pass.
      for (let i = 0; i < layer.path.geometry.drawRange.count; i += 1) {
        const p = new Vector3(attr.getX(i), attr.getY(i), attr.getZ(i))
        expect(p.distanceTo(earth)).toBeGreaterThan(0.05)
      }
      expect(layer.path.geometry.drawRange.count).toBeGreaterThan(200)
    })

    it('rewrites nothing when the date, the frame and the data are unchanged (ADR 0017)', () => {
      const layer = new LookupLayer()
      layer.set(apophis)
      placeAt(layer, CA)
      const nearAttr = layer.nearPath.geometry.getAttribute('position') as BufferAttribute
      const loopAttr = layer.path.geometry.getAttribute('position') as BufferAttribute
      const before = { near: nearAttr.version, loop: loopAttr.version }
      const first = [nearAttr.getX(5), nearAttr.getY(5)]
      placeAt(layer, CA)
      expect(nearAttr.version).toBe(before.near)
      expect(loopAttr.version).toBe(before.loop)
      // A new date moves the pass (the date shown is one of its points); the loop's
      // trimmed run is the same, so it is not rewritten.
      placeAt(layer, CA + 0.01)
      expect(nearAttr.version).toBeGreaterThan(before.near)
      expect(loopAttr.version).toBe(before.loop)
      // The frame half-open: the pass is redrawn, in other places.
      placeAt(layer, CA + 0.01, 0.5)
      expect([nearAttr.getX(5), nearAttr.getY(5)]).not.toEqual(first)
      expect(offLine(layer)).toBeLessThan(EARTH_FRAME_UNIT * 1e-3)
    })

    it('with the frame closed, draws the whole loop and no pass', () => {
      const layer = new LookupLayer()
      layer.set(apophis)
      placeAt(layer, CA, 1)
      placeAt(layer, CA, 0)
      expect(layer.pathPoints()).toBe((apophis.orbit?.points.length ?? 0) + 1)
      expect(layer.nearPathPoints()).toBe(0)
    })

    it('outside Earth’s samples, nothing joins the frame', () => {
      const layer = new LookupLayer()
      layer.set(apophis)
      placeAt(layer, CA + 40)
      expect(layer.nearPathPoints()).toBe(0)
      expect(layer.pathPoints()).toBe((apophis.orbit?.points.length ?? 0) + 1)
    })
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
