/**
 * The Earth frame (#92): around Earth as drawn, true-scale out to GEO and logarithmic
 * beyond, so the Moon, the L1/L2 craft and this fortnight's close approaches sit apart
 * from Earth's marker and in their true order. Blended in log space from true placement
 * (zoomed out) to the frame (zoomed in), so nothing jumps.
 */
import { describe, expect, it } from 'vitest'

import {
  cameraMinDistance,
  EARTH_FRAME_OPEN_CAMERA,
  EARTH_FRAME_OPEN_TARGET,
  EARTH_FRAME_UNIT,
  EARTH_RADIUS_KM,
  earthFrameBlend,
  earthFrameOffset,
  earthFramePosition,
  earthFrameRadii,
  earthFrameRadius,
  GEO_RADII,
  l1TransitMinutes,
} from '@/lib/orrery/earthFrame'
import { AU_KM, LD_KM } from '@/lib/orrery/units'

const L1_KM = 1_500_000

describe('earthFrameRadii (#92)', () => {
  it('is true scale out to GEO', () => {
    expect(earthFrameRadii(EARTH_RADIUS_KM)).toBeCloseTo(1, 6)
    // The ISS, about 420 km up.
    expect(earthFrameRadii(EARTH_RADIUS_KM + 420)).toBeCloseTo(1.066, 3)
    expect(earthFrameRadii(42_164)).toBeCloseTo(GEO_RADII, 6)
  })

  it('compresses beyond GEO, keeping the order Moon < L1 < a 0.05 au approach', () => {
    const moon = earthFrameRadii(LD_KM)
    const l1 = earthFrameRadii(L1_KM)
    const far = earthFrameRadii(0.05 * AU_KM)
    expect(moon).toBeGreaterThan(GEO_RADII)
    expect(l1).toBeGreaterThan(moon + 1)
    expect(far).toBeGreaterThan(l1 + 1)
    // Still a neighbourhood: a 0.05 au approach within about 16 Earth radii as drawn.
    expect(far).toBeLessThan(17)
  })

  it('is continuous at GEO and keeps rising', () => {
    const geoKm = 42_164
    expect(earthFrameRadii(geoKm * 1.0001)).toBeCloseTo(earthFrameRadii(geoKm), 3)
    let last = 0
    for (const km of [7_000, 20_000, 42_164, 1e5, 4e5, 1.5e6, 7.5e6, 1.5e7]) {
      const r = earthFrameRadii(km)
      expect(r).toBeGreaterThan(last)
      last = r
    }
  })
})

describe('earthFramePosition (#92)', () => {
  it('keeps the direction, with place3d axes, scaled by Earth as drawn', () => {
    const rel = { x: L1_KM / AU_KM, y: 0, z: 0 }
    const p = earthFramePosition({ x: 5, y: 1, z: -2 }, rel, 0.05)
    expect(p.x - 5).toBeCloseTo(0.05 * earthFrameRadii(L1_KM), 9)
    expect(p.y).toBe(1)
    expect(p.z).toBe(-2)
    // Ecliptic z (north) is scene y; ecliptic y is scene -z.
    const north = earthFramePosition({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 0.001 }, 1)
    expect(north.y).toBeGreaterThan(0)
    const y = earthFramePosition({ x: 0, y: 0, z: 0 }, { x: 0, y: 0.001, z: 0 }, 1)
    expect(y.z).toBeLessThan(0)
  })
})

describe('earthFrameBlend and earthFrameOffset (#92)', () => {
  it('opens as the camera nears Earth, in frame units', () => {
    // The Inner preset: about 8.2 scene units from Earth, 965 frame units. Closed.
    expect(earthFrameBlend(8.2 / EARTH_FRAME_UNIT)).toBe(0)
    // The Earth–Moon preset: about 59 units on a wide stage, under 110 on a phone.
    expect(earthFrameBlend(59)).toBe(1)
    expect(earthFrameBlend(105)).toBe(1)
    const mid = earthFrameBlend(260)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
  })

  it('stays closed while the camera looks at something else, even near Earth', () => {
    // Venus at its closest, about 0.31 scene units from Earth.
    expect(earthFrameBlend(59, 0.31 / EARTH_FRAME_UNIT)).toBe(0)
    // A close approach 0.05 au out, about 15.6 units: still open.
    expect(earthFrameBlend(59, 15.6)).toBe(1)
  })

  it('keeps the whole neighbourhood inside half the way to Venus', () => {
    expect(EARTH_FRAME_UNIT * earthFrameRadii(0.1 * AU_KM)).toBeLessThan(0.31 / 2)
  })

  it("shrinks Earth from its exaggerated size to the frame's unit, keeping its px size", () => {
    expect(earthFrameRadius(0.048, 0)).toBe(0.048)
    expect(earthFrameRadius(0.048, 1)).toBe(EARTH_FRAME_UNIT)
    // Log-linear in both: radius over camera distance holds through the blend.
    const { closed, open } = EARTH_FRAME_OPEN_CAMERA
    const t = 0.4
    const d = closed * (open / closed) ** t
    const px = (r: number, dist: number) => r / dist
    expect(px(earthFrameRadius(0.048, earthFrameBlend(d)), d)).toBeCloseTo(px(0.048, closed), 3)
  })

  it('moves from the true offset to the frame offset in log space', () => {
    const rel = { x: 0.03, y: 0, z: 0 }
    const trueR = 0.033
    const frameR = 0.05 * earthFrameRadii(0.03 * AU_KM)
    const at = (t: number) => Math.hypot(...Object.values(earthFrameOffset(rel, 0.05, trueR, t)))
    expect(at(0)).toBeCloseTo(trueR, 9)
    expect(at(1)).toBeCloseTo(frameR, 9)
    expect(at(0.5)).toBeCloseTo(Math.sqrt(trueR * frameR), 9)
  })
})

describe('l1TransitMinutes (#92)', () => {
  it('is how long the wind takes from L1 to Earth', () => {
    // 1.5 million km at 400 km/s: 62.5 minutes.
    expect(l1TransitMinutes(400)).toBeCloseTo(62.5, 6)
    expect(l1TransitMinutes(0)).toBeNull()
    expect(l1TransitMinutes(Number.NaN)).toBeNull()
  })
})

describe('cameraMinDistance (#98)', () => {
  it('lets the camera in close to Earth, where the frame is true scale', () => {
    // The Earth orbit view stands about 31 frame units off; the controls once clamped it
    // to 0.5 scene units (59), so the satellites read as fading, not points.
    expect(cameraMinDistance(0)).toBeLessThan(20 * EARTH_FRAME_UNIT)
    expect(cameraMinDistance(0)).toBeGreaterThan(EARTH_FRAME_UNIT)
  })

  it('keeps the old limit anywhere else, so nothing is zoomed into', () => {
    expect(cameraMinDistance(EARTH_FRAME_OPEN_TARGET.closed * EARTH_FRAME_UNIT * 1.01)).toBe(0.5)
    expect(cameraMinDistance(Number.POSITIVE_INFINITY)).toBe(0.5)
  })
})

describe('camera near plane (#197)', () => {
  it('keeps Earth’s near surface beyond the near plane at the closest zoom', async () => {
    const { CAMERA_NEAR } = await import('@/lib/orrery/earthFrame')
    // Target at Earth's centre, Earth drawn at the frame's unit radius.
    const gap = cameraMinDistance(0) - EARTH_FRAME_UNIT
    expect(CAMERA_NEAR).toBe(0.01)
    expect(gap).toBeGreaterThan(CAMERA_NEAR * 1.2)
  })
})
