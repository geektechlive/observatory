/**
 * Pure globe math for the three.js renderer (#45). Lives in src/lib so coverage counts it.
 * Conventions match THREE.SphereGeometry UVs with an equirectangular -180..180 texture.
 */
import { describe, expect, it } from 'vitest'

import {
  altToRadius,
  facingLongitude,
  gpuTier,
  isOccluded,
  isSurfaceVisible,
  latLonToVec3,
  rotationForFacing,
  sunDirection,
  vec3ToLatLon,
} from '@/lib/globe3d'

const close = (a: readonly number[], b: readonly number[], digits = 6) => {
  a.forEach((v, i) => {
    expect(v).toBeCloseTo(b[i] ?? NaN, digits)
  })
}

describe('latLonToVec3', () => {
  it('puts (0, 0) on +X: the u = 0.5 seam of the sphere texture', () => {
    close(latLonToVec3(0, 0), [1, 0, 0])
  })

  it('puts 90°E on -Z and the poles on ±Y', () => {
    close(latLonToVec3(0, 90), [0, 0, -1])
    close(latLonToVec3(90, 0), [0, 1, 0])
    close(latLonToVec3(-90, 45), [0, -1, 0])
  })

  it('scales by radius', () => {
    close(latLonToVec3(0, 0, 2), [2, 0, 0])
  })

  it('round-trips through vec3ToLatLon', () => {
    for (const [lat, lon] of [
      [35.4, -118.6],
      [-33.9, 151.2],
      [64.1, -21.9],
    ] as const) {
      const back = vec3ToLatLon(latLonToVec3(lat, lon, 1.3))
      expect(back.lat).toBeCloseTo(lat, 6)
      expect(back.lon).toBeCloseTo(lon, 6)
    }
  })
})

describe('altToRadius (exaggerated LEO, owner pick)', () => {
  it('lifts the ISS visibly off the surface', () => {
    expect(altToRadius(420)).toBeCloseTo(1 + 0.35 * (420 / 2000), 9)
    expect(altToRadius(420)).toBeGreaterThan(1.05)
  })

  it('caps at 2000 km so GEO does not leave the frame (GEO lives on the bezel)', () => {
    expect(altToRadius(35_786)).toBeCloseTo(1.35, 9)
  })

  it('clamps negative altitude to the surface', () => {
    expect(altToRadius(-5)).toBe(1)
  })
})

describe('surface visibility with a perspective camera', () => {
  const cam: [number, number, number] = [0, 0, 4]

  it('sees the point facing the camera and not the one behind', () => {
    expect(isSurfaceVisible([0, 0, 1], cam)).toBe(true)
    expect(isSurfaceVisible([0, 0, -1], cam)).toBe(false)
  })

  it('hides a point on the equator plane: the true limb sits in front of it (R/d)', () => {
    // dot(n, camDir) = 0 < R/d = 0.25, so a point the orthographic z > 0 test calls
    // "edge" is already behind the limb for a camera at distance 4.
    expect(isSurfaceVisible([1, 0, 0], cam)).toBe(false)
    const justInside = [Math.sin(1.3), 0, Math.cos(1.3)] as const // dot ~0.27 > 0.25
    expect(isSurfaceVisible(justInside, cam)).toBe(true)
  })
})

describe('isOccluded (elevated points: ISS, satellites)', () => {
  const cam: [number, number, number] = [0, 0, 4]

  it('an elevated point behind the Earth is occluded', () => {
    expect(isOccluded([0, 0, -1.2], cam)).toBe(true)
  })

  it('an elevated point beside the limb, in front of the Earth, is not', () => {
    expect(isOccluded([1.2, 0, 0.3], cam)).toBe(false)
  })

  it('a point between the camera and the Earth is never occluded', () => {
    expect(isOccluded([0, 0, 1.3], cam)).toBe(false)
  })
})

describe('sunDirection', () => {
  it('points at Greenwich around 12:00 UTC on the equinox', () => {
    const [x, y, z] = sunDirection(new Date('2026-03-20T12:00:00Z'))
    expect(x).toBeGreaterThan(0.99)
    expect(Math.abs(y)).toBeLessThan(0.06)
    expect(Math.abs(z)).toBeLessThan(0.05)
  })

  it('is a unit vector', () => {
    const [x, y, z] = sunDirection(new Date('2026-06-21T04:00:00Z'))
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 9)
  })
})

describe('facing longitude and rotation', () => {
  it('rotation 0 faces 90°W (the camera looks down -Z)', () => {
    expect(facingLongitude(0)).toBeCloseTo(-90, 9)
  })

  it('rotationForFacing inverts facingLongitude', () => {
    for (const lon of [-170, -45, 0, 30, 179]) {
      expect(facingLongitude(rotationForFacing(lon))).toBeCloseTo(lon, 6)
    }
  })
})

describe('gpuTier', () => {
  it('treats software rendering and small texture limits as low tier', () => {
    expect(
      gpuTier({ renderer: 'SwiftShader Device', maxTextureSize: 16_384, isMobile: false }).tier,
    ).toBe('low')
    expect(gpuTier({ renderer: 'Apple M4', maxTextureSize: 4096, isMobile: false }).tier).toBe(
      'low',
    )
  })

  it('gives phones 2K textures, sprite glow and a 1.5 DPR cap (owner default)', () => {
    expect(gpuTier({ renderer: 'Apple GPU', maxTextureSize: 16_384, isMobile: true })).toEqual({
      tier: 'low',
      textureWidth: 2048,
      bloom: false,
      dprCap: 1.5,
    })
  })

  it('gives desktop GPUs 4K textures, real bloom and DPR up to 2', () => {
    expect(gpuTier({ renderer: 'Apple M4', maxTextureSize: 16_384, isMobile: false })).toEqual({
      tier: 'high',
      textureWidth: 4096,
      bloom: true,
      dprCap: 2,
    })
  })
})
