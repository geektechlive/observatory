/**
 * The satellite layer's pure rules (#98): how it shows at each camera distance from
 * Earth, how often the worker runs, and where a TEME position lands in the orrery's
 * Earth frame.
 */
import { describe, expect, it } from 'vitest'

import { EARTH_FRAME_UNIT, EARTH_RADIUS_KM, GEO_RADII } from '@/lib/orrery/earthFrame'
import {
  epochAgeText,
  HAZE_ONLY_RATE,
  SAT_DISTANCE,
  satAltitudeKm,
  satDisplay,
  satScenePosition,
  temeToScene,
} from '@/lib/orrery/satView'

const JD_J2000 = 2_451_545
const JD_2026 = 2_461_351.5 // 2026-11-07 00:00 UTC

const apply = (m: readonly number[], v: [number, number, number]) => [
  (m[0] ?? 0) * v[0] + (m[1] ?? 0) * v[1] + (m[2] ?? 0) * v[2],
  (m[3] ?? 0) * v[0] + (m[4] ?? 0) * v[1] + (m[5] ?? 0) * v[2],
  (m[6] ?? 0) * v[0] + (m[7] ?? 0) * v[1] + (m[8] ?? 0) * v[2],
]
const deg = (r: number) => (r * 180) / Math.PI

describe('satDisplay (#98): points near Earth, haze as you pull back, nothing far out', () => {
  it('draws points, pickable, with a 1 s pass while the camera is close', () => {
    const d = satDisplay(20, 1, 1)
    expect(d.pointsAlpha).toBe(1)
    expect(d.hazeAlpha).toBe(0)
    expect(d.pickable).toBe(true)
    expect(d.cadenceMs).toBe(1000)
  })

  it('fades the points and slows the worker in the middle band, not pickable', () => {
    const d = satDisplay(55, 1, 1)
    expect(d.pointsAlpha).toBeGreaterThan(0)
    expect(d.pointsAlpha).toBeLessThan(1)
    expect(d.pickable).toBe(false)
    expect(d.cadenceMs).toBe(2000)
  })

  it('is a haze only once pulled back, with the worker stopped', () => {
    const d = satDisplay(100, 1, 1)
    expect(d.pointsAlpha).toBe(0)
    expect(d.hazeAlpha).toBe(1)
    expect(d.cadenceMs).toBeNull()
  })

  it('hides everything far out', () => {
    const d = satDisplay(SAT_DISTANCE.hidden + 1, 1, 1)
    expect(d.pointsAlpha).toBe(0)
    expect(d.hazeAlpha).toBe(0)
    expect(d.cadenceMs).toBeNull()
  })

  it('shows haze only above 60x playback, even up close', () => {
    const d = satDisplay(10, HAZE_ONLY_RATE + 1, 1)
    expect(d.pointsAlpha).toBe(0)
    expect(d.hazeAlpha).toBe(1)
    expect(d.pickable).toBe(false)
    expect(d.cadenceMs).toBeNull()
    expect(satDisplay(10, HAZE_ONLY_RATE, 1).pointsAlpha).toBe(1)
  })

  it('fades with the Earth frame and is gone while the frame is closed', () => {
    expect(satDisplay(20, 1, 0.5).pointsAlpha).toBeCloseTo(0.5)
    const closed = satDisplay(20, 1, 0)
    expect(closed.pointsAlpha).toBe(0)
    expect(closed.hazeAlpha).toBe(0)
    expect(closed.cadenceMs).toBeNull()
    expect(closed.pickable).toBe(false)
  })

  it('never shows points and haze both at full strength', () => {
    for (let re = 1; re < 400; re *= 1.1) {
      const d = satDisplay(re, 1, 1)
      expect(d.pointsAlpha + d.hazeAlpha).toBeLessThanOrEqual(1.0001)
    }
  })
})

describe('temeToScene (#98): TEME km to the orrery’s scene axes', () => {
  it('at J2000 puts the equinox on scene +x and Earth’s pole 23.44° off the ecliptic pole', () => {
    const m = temeToScene(JD_J2000)
    const x = apply(m, [1, 0, 0])
    expect(x[0]).toBeCloseTo(1, 9)
    expect(x[1]).toBeCloseTo(0, 9)
    expect(x[2]).toBeCloseTo(0, 9)
    // Scene y is ecliptic north. The celestial pole sits at ecliptic longitude 90°,
    // latitude 90° − ε: ecliptic (0, sin ε, cos ε), so scene (0, cos ε, −sin ε).
    const pole = apply(m, [0, 0, 1])
    expect(deg(Math.acos(pole[1] ?? 0))).toBeCloseTo(23.4393, 3)
    expect(pole[0]).toBeCloseTo(0, 9)
    expect(pole[2]).toBeLessThan(0)
  })

  it('rotates the equinox of date back by the precession since J2000 (0.375° by 2026)', () => {
    const x = apply(temeToScene(JD_2026), [1, 0, 0])
    // Scene (x, y, z) = ecliptic (x, z, −y): the equinox of date lies at J2000 longitude −p,
    // p = 5029.0966″ per Julian century (IAU 2006), 0.26849 centuries after J2000.
    const lon = deg(Math.atan2(-(x[2] ?? 0), x[0] ?? 0))
    expect(lon).toBeCloseTo(-0.3751, 3)
  })

  it('is a rotation: lengths are kept', () => {
    const m = temeToScene(JD_2026)
    const v = apply(m, [3000, -4000, 1200])
    expect(Math.hypot(...v)).toBeCloseTo(Math.hypot(3000, -4000, 1200), 6)
  })
})

describe('satScenePosition (#98): the Earth frame’s own scale', () => {
  const earth = { x: 1, y: 2, z: 3 }
  const m = temeToScene(JD_J2000)

  it('is true scale inside GEO, in Earth radii as drawn', () => {
    const p = satScenePosition([EARTH_RADIUS_KM * 2, 0, 0], m, earth, EARTH_FRAME_UNIT)
    expect((p?.x ?? 0) - earth.x).toBeCloseTo(2 * EARTH_FRAME_UNIT, 9)
    expect(p?.y).toBeCloseTo(earth.y, 9)
  })

  it('compresses beyond GEO like the rest of the frame', () => {
    const p = satScenePosition([EARTH_RADIUS_KM * GEO_RADII * 10, 0, 0], m, earth, 1)
    expect((p?.x ?? 0) - earth.x).toBeCloseTo(GEO_RADII + 4, 6)
  })

  it('returns null for a position SGP4 could not give', () => {
    expect(satScenePosition([Number.NaN, 0, 0], m, earth, 1)).toBeNull()
  })
})

describe('satAltitudeKm and epochAgeText (#98 inspector)', () => {
  it('measures height above the mean Earth radius', () => {
    expect(satAltitudeKm([EARTH_RADIUS_KM + 420, 0, 0])).toBeCloseTo(420, 6)
  })

  it('says how old the orbit data is, in hours, or days past two', () => {
    const now = Date.parse('2026-11-07T12:00:00Z')
    expect(epochAgeText(now - 5 * 3_600_000, now)).toBe('5 h before this date')
    expect(epochAgeText(now - 3 * 86_400_000, now)).toBe('3.0 days before this date')
    expect(epochAgeText(now + 2 * 3_600_000, now)).toBe('2 h after this date')
  })
})
