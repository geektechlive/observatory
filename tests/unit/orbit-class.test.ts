/**
 * The satellite browser's orbit classes (#158) and launch ordering, from the mean
 * elements already in every stored row.
 */
import { describe, expect, it } from 'vitest'

import {
  launchOrder,
  ORBIT_GEO,
  ORBIT_HEO,
  ORBIT_LEO,
  ORBIT_MEO,
  ORBIT_UNKNOWN,
  orbitClassOf,
} from '@/lib/orbit/orbitClass'

describe('orbitClassOf', () => {
  it('puts the ISS and Starlink in low orbit', () => {
    expect(orbitClassOf(15.5, 0.0004)).toBe(ORBIT_LEO)
    expect(orbitClassOf(15.06, 0.0001)).toBe(ORBIT_LEO)
  })

  it('puts GPS (two orbits a day) in medium orbit', () => {
    expect(orbitClassOf(2.0056, 0.005)).toBe(ORBIT_MEO)
  })

  it('puts a satellite that keeps pace with the Earth in the geostationary ring', () => {
    expect(orbitClassOf(1.0027, 0.0002)).toBe(ORBIT_GEO)
  })

  it('puts a Molniya orbit (two a day, e 0.7) in high orbit, not medium', () => {
    expect(orbitClassOf(2.0, 0.7)).toBe(ORBIT_HEO)
  })

  it('puts a very eccentric low orbit in high orbit', () => {
    expect(orbitClassOf(14, 0.3)).toBe(ORBIT_HEO)
  })

  it('treats the boundary of low orbit (11.25 rev/day) as low', () => {
    expect(orbitClassOf(11.25, 0.001)).toBe(ORBIT_LEO)
    expect(orbitClassOf(11.2, 0.001)).toBe(ORBIT_MEO)
  })

  it('puts slower-than-geostationary orbits in high orbit', () => {
    expect(orbitClassOf(0.5, 0.01)).toBe(ORBIT_HEO)
  })

  it('is unknown for unreadable elements', () => {
    expect(orbitClassOf(Number.NaN, 0.1)).toBe(ORBIT_UNKNOWN)
    expect(orbitClassOf(15, Number.NaN)).toBe(ORBIT_UNKNOWN)
  })
})

describe('launchOrder', () => {
  it('orders by year then launch number', () => {
    expect(launchOrder('2026-100A')).toBeGreaterThan(launchOrder('2026-099Z'))
    expect(launchOrder('2026-001A')).toBeGreaterThan(launchOrder('2025-999A'))
  })

  it('reads the 1957-1999 designators as the right century', () => {
    expect(launchOrder('1998-067A')).toBe(1998 * 1000 + 67)
    expect(launchOrder('1957-001B')).toBe(1957 * 1000 + 1)
  })

  it('is 0 for a missing or odd designator', () => {
    expect(launchOrder('')).toBe(0)
    expect(launchOrder('unknown')).toBe(0)
  })
})
