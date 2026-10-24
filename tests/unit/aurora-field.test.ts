/**
 * The aurora field (#50): OVATION cells become one equirect texture on a shell, not
 * thousands of points. The shader finds its texel from the shell's object-space
 * position; fieldUv() is its TypeScript twin, so these tests pin the orientation.
 */
import { describe, expect, it } from 'vitest'

import {
  AURORA_ALPHA_MAX,
  auroraAlpha,
  auroraFieldData,
  FIELD_H,
  FIELD_W,
  fieldCell,
  fieldUv,
} from '@/lib/auroraField'
import { latLonToVec3 } from '@/lib/globe3d'

describe('auroraAlpha', () => {
  it('uses the SVG globe scale, so OVATION 4..29 is not flattened to one brightness', () => {
    expect(auroraAlpha(0)).toBe(0)
    expect(auroraAlpha(4)).toBeCloseTo(0.07 + 4 / 70, 6)
    expect(auroraAlpha(10)).toBeGreaterThan(auroraAlpha(5))
    expect(auroraAlpha(20)).toBeGreaterThan(auroraAlpha(10))
    expect(auroraAlpha(90)).toBe(AURORA_ALPHA_MAX)
  })
})

describe('fieldCell and fieldUv agree on where a lat/lon lives', () => {
  const samples: [number, number][] = [
    [65, -150],
    [70, 0],
    [-68, 120],
    [61, -62],
    [0, 179],
    [-89, -179],
  ]

  it.each(samples)(
    'lat %d, lon %d: the shader twin lands in the cell the data was written to',
    (lat, lon) => {
      const [u, v] = fieldUv(latLonToVec3(lat, lon, 1.012))
      const x = Math.floor(u * FIELD_W) % FIELD_W
      const y = Math.min(FIELD_H - 1, Math.floor(v * FIELD_H))
      expect(y * FIELD_W + x).toBe(fieldCell(lon, lat))
    },
  )

  it('wraps longitudes past the antimeridian', () => {
    expect(fieldCell(181, 10)).toBe(fieldCell(-179, 10))
    expect(fieldCell(-180, 10)).toBe(fieldCell(180, 10))
  })
})

describe('auroraFieldData', () => {
  it('writes each cell as its alpha in a byte, and leaves the rest dark', () => {
    const data = auroraFieldData([
      [-62, 61, 20],
      [100, -70, 5],
    ])
    expect(data).toHaveLength(FIELD_W * FIELD_H)
    expect(data[fieldCell(-62, 61)]).toBe(Math.round(auroraAlpha(20) * 255))
    expect(data[fieldCell(100, -70)]).toBe(Math.round(auroraAlpha(5) * 255))
    const lit = data.reduce((n, b) => n + (b > 0 ? 1 : 0), 0)
    expect(lit).toBe(2)
  })

  it('keeps the brightest value when two points share a cell', () => {
    const data = auroraFieldData([
      [10, 65, 25],
      [10.4, 65.3, 6],
    ])
    expect(data[fieldCell(10, 65)]).toBe(Math.round(auroraAlpha(25) * 255))
  })
})
