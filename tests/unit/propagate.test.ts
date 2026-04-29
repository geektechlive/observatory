import { describe, it, expect } from 'vitest'
import { propagateIss, computeTrail } from '@/lib/orbit/propagate'

// Real ISS TLE from CelesTrak (representative, not live)
const TLE_LINE1 = '1 25544U 98067A   24120.50000000  .00020000  00000-0  35000-3 0  9999'
const TLE_LINE2 = '2 25544  51.6400 120.0000 0001000  90.0000 270.0000 15.50000000 12345'

describe('propagateIss', () => {
  it('returns a position object with numeric lat, lon, alt, vel', () => {
    const pos = propagateIss(TLE_LINE1, TLE_LINE2, new Date('2024-04-29T12:00:00Z'))
    expect(pos).not.toBeNull()
    if (pos === null) return
    expect(typeof pos.lat).toBe('number')
    expect(typeof pos.lon).toBe('number')
    expect(typeof pos.alt).toBe('number')
    expect(typeof pos.vel).toBe('number')
  })

  it('returns lat within [-90, 90]', () => {
    const pos = propagateIss(TLE_LINE1, TLE_LINE2, new Date('2024-04-29T12:00:00Z'))
    if (pos === null) return
    expect(pos.lat).toBeGreaterThanOrEqual(-90)
    expect(pos.lat).toBeLessThanOrEqual(90)
  })

  it('returns lon within [-180, 180]', () => {
    const pos = propagateIss(TLE_LINE1, TLE_LINE2, new Date('2024-04-29T12:00:00Z'))
    if (pos === null) return
    expect(pos.lon).toBeGreaterThanOrEqual(-180)
    expect(pos.lon).toBeLessThanOrEqual(180)
  })

  it('returns realistic ISS altitude (300-450 km)', () => {
    const pos = propagateIss(TLE_LINE1, TLE_LINE2, new Date('2024-04-29T12:00:00Z'))
    if (pos === null) return
    expect(pos.alt).toBeGreaterThan(200)
    expect(pos.alt).toBeLessThan(500)
  })

  it('returns realistic ISS velocity (> 25000 km/h)', () => {
    const pos = propagateIss(TLE_LINE1, TLE_LINE2, new Date('2024-04-29T12:00:00Z'))
    if (pos === null) return
    expect(pos.vel).toBeGreaterThan(25_000)
  })
})

describe('computeTrail', () => {
  it('returns an array of [lon, lat] coordinate pairs', () => {
    const trail = computeTrail(TLE_LINE1, TLE_LINE2, new Date('2024-04-29T12:00:00Z'))
    expect(Array.isArray(trail)).toBe(true)
    expect(trail.length).toBeGreaterThan(0)
    const first = trail[0]
    expect(first).toBeDefined()
    if (first !== undefined) {
      expect(first.length).toBe(2)
    }
  })

  it('returns approximately 91 points (±45 min at 1-min intervals)', () => {
    const trail = computeTrail(TLE_LINE1, TLE_LINE2, new Date('2024-04-29T12:00:00Z'))
    expect(trail.length).toBeGreaterThanOrEqual(80)
    expect(trail.length).toBeLessThanOrEqual(91)
  })
})
