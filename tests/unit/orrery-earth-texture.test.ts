/**
 * #138 review: the meridian test reads longitude back through the globe's mapping
 * (vec3ToLatLon). This checks the other half against the pixels: the skin's sphere puts
 * texture u = 0.5 at local +x (longitude 0) and u = 0.75 at −z (90° E), and the Earth map
 * itself has Greenwich at u = 0.5, east to the right, north at the top. Known land and sea
 * points must land on land and sea texels, and their east-west mirrors must not.
 */
import { resolve } from 'node:path'

import sharp from 'sharp'
import { SphereGeometry } from 'three'
import { beforeAll, describe, expect, it } from 'vitest'

import { BODY_IMAGERY } from '@/lib/orrery/imagery'

const MAP = resolve(__dirname, '../../public', `.${BODY_IMAGERY.Earth.texture ?? ''}`)

let pixels: Buffer
let width = 0
let height = 0

beforeAll(async () => {
  const { data, info } = await sharp(MAP).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  pixels = data
  width = info.width
  height = info.height
})

/** The texel a latitude and longitude land on: u from longitude, rows from the north. */
function texel(lat: number, lon: number): { r: number; g: number; b: number } {
  const u = (lon + 180) / 360
  const x = Math.min(width - 1, Math.floor(u * width))
  const y = Math.min(height - 1, Math.floor(((90 - lat) / 180) * height))
  const i = (y * width + x) * 3
  return { r: pixels[i] ?? 0, g: pixels[i + 1] ?? 0, b: pixels[i + 2] ?? 0 }
}
const isSea = (lat: number, lon: number) => {
  const { r, b } = texel(lat, lon)
  return b > r + 15
}

describe("Earth's map has Greenwich at u = 0.5, east to the right (#138)", () => {
  it('puts u = 0.5 at the skin’s +x and u = 0.75 at −z', () => {
    const geo = new SphereGeometry(1, 48, 32)
    const pos = geo.getAttribute('position')
    const uv = geo.getAttribute('uv')
    const uAt = (x: number, z: number) => {
      let best = -1
      let bestD = Infinity
      for (let i = 0; i < pos.count; i += 1) {
        const d = Math.hypot(pos.getX(i) - x, pos.getY(i), pos.getZ(i) - z)
        if (d < bestD) {
          bestD = d
          best = i
        }
      }
      return uv.getX(best)
    }
    expect(uAt(1, 0)).toBeCloseTo(0.5, 6)
    expect(uAt(0, -1)).toBeCloseTo(0.75, 6)
  })

  it.each([
    ['the Gulf of Guinea', 0, 0, true],
    ['the Sahara', 20, 10, false],
    ['the Congo basin', 0, 20, false],
    ['the Atlantic, its mirror', 0, -20, true],
    ['central Australia', -25, 135, false],
    ['the South Atlantic, its mirror', -25, -135, true],
    ['the Amazon', -5, -60, false],
    ['the Indian Ocean, its mirror', -5, 60, true],
  ] as const)('%s (%d, %d) is sea: %s', (_name, lat, lon, sea) => {
    expect(isSea(lat, lon)).toBe(sea)
  })
})
