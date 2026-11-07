import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { ELEMENTS, PLANETS } from '@/lib/orrery'
import { BODY_IMAGERY, poleEcliptic, SATURN_RINGS, spinAngle } from '@/lib/orrery/imagery'

const PUBLIC = resolve(__dirname, '../../public')
const deg = Math.PI / 180

/** Unit normal of a planet's orbit, ecliptic J2000, from Table 1's I and node at J2000. */
function orbitNormal(planet: (typeof PLANETS)[number]) {
  const i = ELEMENTS[planet].I[0] * deg
  const node = ELEMENTS[planet].node[0] * deg
  return { x: Math.sin(i) * Math.sin(node), y: -Math.sin(i) * Math.cos(node), z: Math.cos(i) }
}

describe('orrery imagery (#105)', () => {
  it('labels every body with a colour kind, a mission and a credit', () => {
    for (const name of ['Sun', ...PLANETS] as const) {
      const img = BODY_IMAGERY[name]
      expect(['true', 'enhanced', 'simulated', 'shaded', 'observed']).toContain(img.colour)
      expect(img.mission.length).toBeGreaterThan(0)
      expect(img.credit.length).toBeGreaterThan(0)
    }
    expect(BODY_IMAGERY.Mercury.colour).toBe('enhanced')
    expect(BODY_IMAGERY.Saturn.credit).toContain('Björn Jónsson')
    expect(BODY_IMAGERY.Neptune.credit).toContain('Björn Jónsson')
    expect(BODY_IMAGERY.Sun.colour).toBe('observed')
  })

  it('maps only the planets that have a real global map; Venus and Uranus are shaded', () => {
    expect(BODY_IMAGERY.Venus.texture).toBeUndefined()
    expect(BODY_IMAGERY.Uranus.texture).toBeUndefined()
    expect(BODY_IMAGERY.Venus.colour).toBe('shaded')
    expect(BODY_IMAGERY.Uranus.colour).toBe('shaded')
  })

  it('points each texture at a real WebP in public/ (magic bytes, as the font lesson taught)', () => {
    const textures = [
      ...PLANETS.map((p) => BODY_IMAGERY[p].texture).filter((t): t is string => Boolean(t)),
      SATURN_RINGS.texture,
    ]
    expect(textures.length).toBeGreaterThanOrEqual(7)
    for (const url of textures) {
      const head = readFileSync(resolve(PUBLIC, `.${url}`)).subarray(0, 12)
      expect(head.subarray(0, 4).toString('latin1'), url).toBe('RIFF')
      expect(head.subarray(8, 12).toString('latin1'), url).toBe('WEBP')
    }
  })

  it('ships no planet texture the code does not use', () => {
    const used = new Set(
      [...PLANETS.map((p) => BODY_IMAGERY[p].texture), SATURN_RINGS.texture].filter(Boolean),
    )
    for (const file of readdirSync(resolve(PUBLIC, 'textures/planets'))) {
      expect(used.has(`/textures/planets/${file}`), file).toBe(true)
    }
  })

  // Sidereal periods and obliquities: NASA's planetary fact sheet (checked 2026-11-07).
  it('spins each planet at its sidereal period, retrograde for Venus and Uranus', () => {
    expect(BODY_IMAGERY.Earth.rotationHours).toBeCloseTo(23.9345, 3)
    expect(BODY_IMAGERY.Jupiter.rotationHours).toBeCloseTo(9.925, 2)
    expect(BODY_IMAGERY.Venus.rotationHours).toBeLessThan(0)
    expect(BODY_IMAGERY.Uranus.rotationHours).toBeLessThan(0)
    const quarterDay = spinAngle('Earth', 2451545 + 23.9345 / 24 / 4) - spinAngle('Earth', 2451545)
    expect(quarterDay).toBeCloseTo(Math.PI / 2, 4)
    expect(spinAngle('Venus', 2451546) - spinAngle('Venus', 2451545)).toBeLessThan(0)
  })

  it('places each pole so its tilt to the orbit matches the fact-sheet obliquity', () => {
    const obliquity: Record<(typeof PLANETS)[number], number> = {
      Mercury: 0.034,
      Venus: 177.4,
      Earth: 23.4,
      Mars: 25.2,
      Jupiter: 3.1,
      Saturn: 26.7,
      Uranus: 97.8,
      Neptune: 28.3,
    }
    for (const planet of PLANETS) {
      const p = poleEcliptic(planet)
      const n = orbitNormal(planet)
      expect(Math.hypot(p.x, p.y, p.z)).toBeCloseTo(1, 9)
      // Retrograde rotators: the IAU north pole is the one north of the invariable plane,
      // so the spin axis (the angular-momentum pole) is its opposite.
      const sign = (BODY_IMAGERY[planet].rotationHours ?? 1) < 0 ? -1 : 1
      const tilt = Math.acos(sign * (p.x * n.x + p.y * n.y + p.z * n.z)) / deg
      expect(Math.abs(tilt - obliquity[planet]), planet).toBeLessThan(0.6)
    }
  })

  it('spans Saturn’s rings from 74,510 to 140,390 km (Jónsson’s profiles)', () => {
    expect(SATURN_RINGS.innerKm).toBe(74_510)
    expect(SATURN_RINGS.outerKm).toBe(140_390)
    expect(SATURN_RINGS.credit).toContain('Björn Jónsson')
  })
})
