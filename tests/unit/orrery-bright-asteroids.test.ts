/**
 * The bright asteroids of the Tonight list (#99 item 4): the SBDB query, the H,G magnitude
 * law (checked against a Horizons observer table) and the choice of which to place.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  asteroidMagnitude,
  MAX_ASTEROIDS,
  parseSbdbAsteroids,
  phaseAngleDeg,
  sbdbAsteroidQueryUrl,
  selectAsteroids,
  targetMatchesAsteroid,
} from '@/lib/orrery/smallBodies'

const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures', 'tonight', 'sbdb-asteroids.json'), 'utf8'),
) as unknown

describe('the SBDB asteroid query', () => {
  it('asks for numbered-bright main-belt asteroids with H, G and the elements', () => {
    const url = new URL(sbdbAsteroidQueryUrl())
    expect(url.searchParams.get('sb-kind')).toBe('a')
    expect(JSON.parse(url.searchParams.get('sb-cdata') ?? '{}')).toEqual({
      AND: ['H|LT|8', 'a|LT|5.5'],
    })
    expect(url.searchParams.get('fields')).toBe('full_name,pdes,spkid,H,G,e,q,tp,i,om,w')
    expect(url.searchParams.get('full-prec')).toBe('true')
  })

  it('parses rows, keeping G as null where JPL has none', () => {
    const rows = parseSbdbAsteroids(fixture)
    const vesta = rows.find((r) => r.des === '4')
    expect(vesta).toMatchObject({ spkid: '20000004', name: '4 Vesta', h: 3.25, g: 0.32 })
    const iris = rows.find((r) => r.des === '7')
    expect(iris?.g).toBeNull()
    expect(iris?.name).toBe('7 Iris')
  })

  it('refuses an answer whose fields are not the ones asked for', () => {
    expect(() => parseSbdbAsteroids({ fields: ['full_name'], data: [] })).toThrow(/fields/)
  })
})

describe('the H,G magnitude law', () => {
  // Horizons observer table for 4 Vesta, 2026-Nov-12 00:00 UT (H 3.25, G 0.32):
  // APmag 6.927 at r 2.491484089471, delta 1.63032259862906, S-T-O 13.9105 deg.
  it('matches Horizons for Vesta', () => {
    const v = asteroidMagnitude(3.25, 0.32, 2.491484089471, 1.63032259862906, 13.9105)
    expect(v).toBeCloseTo(6.927, 2)
  })

  it('gets the phase angle from the three distances', () => {
    expect(phaseAngleDeg(1, 1, Math.SQRT2)).toBeCloseTo(90, 6)
    expect(phaseAngleDeg(2, 1, 1)).toBeCloseTo(0, 6)
  })

  it('is fainter as the phase angle grows', () => {
    const near = asteroidMagnitude(5, 0.15, 2.5, 1.6, 5)
    const far = asteroidMagnitude(5, 0.15, 2.5, 1.6, 30)
    expect(far).toBeGreaterThan(near)
  })
})

describe('naming the target', () => {
  it('matches a numbered asteroid by its number and provisional designation', () => {
    expect(targetMatchesAsteroid('4', '4 Vesta (A807 FA)')).toBe(true)
    expect(targetMatchesAsteroid('4', '44 Nysa (A857 SA)')).toBe(false)
    expect(targetMatchesAsteroid('4', null)).toBe(false)
  })
  it('matches an unnumbered one by the designation in brackets', () => {
    expect(targetMatchesAsteroid('2024 YR4', '(2024 YR4)')).toBe(true)
    expect(targetMatchesAsteroid('2024 YR4', '(2024 YR5)')).toBe(false)
  })
})

describe('choosing the asteroids to place', () => {
  const rows = parseSbdbAsteroids(fixture)
  // Everything sits at 2 au from the Sun and 1 au from Earth: only H differs.
  const positionAt = () => ({ x: 2, y: 0, z: 0 })
  const earthAt = () => ({ x: 1, y: 0, z: 0 })

  it('ranks by forecast magnitude, brightest first, and drops the faint ones', () => {
    const chosen = selectAsteroids(rows, 2461000, { positionAt, earthAt })
    expect(chosen.length).toBeGreaterThan(0)
    for (let i = 1; i < chosen.length; i += 1) {
      expect(chosen[i]?.magnitude).toBeGreaterThanOrEqual(chosen[i - 1]?.magnitude ?? 0)
    }
    expect(chosen.every((c) => c.magnitude <= 11.5)).toBe(true)
  })

  it('keeps at most the limit', () => {
    expect(selectAsteroids(rows, 2461000, { positionAt, earthAt, limit: 3 })).toHaveLength(3)
    expect(MAX_ASTEROIDS).toBeGreaterThanOrEqual(10)
  })

  it('uses G = 0.15 where JPL has none', () => {
    const iris = rows.find((r) => r.des === '7')
    expect(iris).toBeDefined()
    const [chosen] = selectAsteroids(iris ? [iris] : [], 2461000, { positionAt, earthAt })
    const alpha = phaseAngleDeg(2, 1, 1)
    expect(chosen?.magnitude).toBeCloseTo(asteroidMagnitude(iris?.h ?? 0, 0.15, 2, 1, alpha), 9)
  })
})
