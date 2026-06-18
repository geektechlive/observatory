import { describe, it, expect } from 'vitest'
import { subsolarPoint, smallCircleRing, horizonRadiusDeg, normalizeLon } from '@/lib/solar'

describe('normalizeLon', () => {
  it('wraps into [-180, 180]', () => {
    expect(normalizeLon(190)).toBeCloseTo(-170, 5)
    expect(normalizeLon(-190)).toBeCloseTo(170, 5)
    expect(normalizeLon(0)).toBe(0)
  })
})

describe('subsolarPoint', () => {
  it('places the subsolar longitude near Greenwich at 12:00 UTC', () => {
    const { lon } = subsolarPoint(new Date('2026-03-20T12:00:00Z'))
    expect(Math.abs(lon)).toBeLessThan(2)
  })

  it('places the subsolar longitude near the antimeridian at 00:00 UTC', () => {
    const { lon } = subsolarPoint(new Date('2026-03-20T00:00:00Z'))
    expect(Math.abs(Math.abs(lon) - 180)).toBeLessThan(2)
  })

  it('puts declination near 0 at the equinox', () => {
    const { lat } = subsolarPoint(new Date('2026-03-20T12:00:00Z'))
    expect(Math.abs(lat)).toBeLessThan(3)
  })

  it('puts declination near +23.4 at the June solstice', () => {
    const { lat } = subsolarPoint(new Date('2026-06-21T12:00:00Z'))
    expect(lat).toBeGreaterThan(21)
  })
})

describe('smallCircleRing', () => {
  it('returns points all ~radius degrees from the center', () => {
    const center = { lat: 10, lon: 20 }
    const radius = 30
    const ring = smallCircleRing(center.lat, center.lon, radius, 24)
    const toRad = Math.PI / 180
    for (const [lat, lon] of ring) {
      // great-circle distance from center
      const dLat = (lat - center.lat) * toRad
      const dLon = (lon - center.lon) * toRad
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(center.lat * toRad) * Math.cos(lat * toRad) * Math.sin(dLon / 2) ** 2
      const dist = (2 * Math.asin(Math.min(1, Math.sqrt(a)))) / toRad
      expect(Math.abs(dist - radius)).toBeLessThan(0.5)
    }
  })

  it('returns n+1 points (closed ring)', () => {
    expect(smallCircleRing(0, 0, 45, 12)).toHaveLength(13)
  })
})

describe('horizonRadiusDeg', () => {
  it('gives ~22-23 degrees for the ISS at ~420 km', () => {
    const r = horizonRadiusDeg(420)
    expect(r).toBeGreaterThan(20)
    expect(r).toBeLessThan(24)
  })

  it('grows with altitude', () => {
    expect(horizonRadiusDeg(800)).toBeGreaterThan(horizonRadiusDeg(420))
  })
})
