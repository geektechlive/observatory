/**
 * Pure math for the three.js globe (ROCI v2 spec section 5, #45). No three.js import,
 * so it is unit-tested and counted by coverage; the renderer converts to THREE types.
 *
 * Conventions match THREE.SphereGeometry UVs with an equirectangular -180..180 texture:
 * (0°, 0°) is +X (the u = 0.5 seam), 90°E is -Z, the north pole is +Y. The camera
 * looks down -Z and the globe group rotates about Y.
 */
import { subsolarPoint } from './solar'

export type Vec3 = readonly [number, number, number]

const RAD = Math.PI / 180

export function latLonToVec3(lat: number, lon: number, r = 1): [number, number, number] {
  const cl = Math.cos(lat * RAD)
  return [r * cl * Math.cos(lon * RAD), r * Math.sin(lat * RAD), -r * cl * Math.sin(lon * RAD)]
}

export function vec3ToLatLon([x, y, z]: Vec3): { lat: number; lon: number } {
  const r = Math.hypot(x, y, z)
  return { lat: Math.asin(y / r) / RAD, lon: Math.atan2(-z, x) / RAD }
}

/** Orbits above this are drawn at the cap; GEO is shown as a bezel band instead. */
const ALT_CAP_KM = 2000
const ALT_EXAGGERATION = 0.35

/** Exaggerated LEO (owner pick): at true scale the ISS sits ~7% up and is invisible. */
export function altToRadius(altKm: number): number {
  const km = Math.min(Math.max(altKm, 0), ALT_CAP_KM)
  return 1 + ALT_EXAGGERATION * (km / ALT_CAP_KM)
}

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/**
 * A surface point is visible when it is in front of the true limb. For a camera at
 * distance d that limb sits at dot(n, camDir) = R/d, not at the equator plane
 * (the spike's `dot > 0` test exposed points just behind the limb).
 */
export function isSurfaceVisible(point: Vec3, camera: Vec3, radius = 1): boolean {
  return dot(point, camera) > radius * radius
}

/** Ray from the camera to an elevated point: occluded if it enters the sphere first. */
export function isOccluded(point: Vec3, camera: Vec3, radius = 1): boolean {
  const d: Vec3 = [point[0] - camera[0], point[1] - camera[1], point[2] - camera[2]]
  const a = dot(d, d)
  const b = 2 * dot(camera, d)
  const c = dot(camera, camera) - radius * radius
  const disc = b * b - 4 * a * c
  if (disc <= 0) return false
  const t = (-b - Math.sqrt(disc)) / (2 * a)
  return t > 0 && t < 1
}

/** Unit vector toward the Sun in globe (unrotated) coordinates. */
export function sunDirection(date: Date): [number, number, number] {
  const { lat, lon } = subsolarPoint(date)
  return latLonToVec3(lat, lon, 1)
}

const wrapLon = (lon: number): number => ((((lon + 180) % 360) + 360) % 360) - 180

/** Longitude under the camera for a globe rotated by `rotationY` radians. */
export function facingLongitude(rotationY: number): number {
  return wrapLon(-90 - rotationY / RAD)
}

export function rotationForFacing(lon: number): number {
  return (-90 - lon) * RAD
}

export interface GpuInfo {
  renderer: string
  maxTextureSize: number
  isMobile: boolean
}

export interface GpuTier {
  tier: 'high' | 'low'
  /** Earth texture width; height is half. VRAM is w x h x 4 x 1.33 each. */
  textureWidth: 2048 | 4096
  /** Real selective bloom; low tier uses additive sprites (owner default for phones). */
  bloom: boolean
  dprCap: number
}

const SOFTWARE = /swiftshader|llvmpipe|software|basic render/i

export function gpuTier({ renderer, maxTextureSize, isMobile }: GpuInfo): GpuTier {
  const weak = isMobile || SOFTWARE.test(renderer) || maxTextureSize < 8192
  return weak
    ? { tier: 'low', textureWidth: 2048, bloom: false, dprCap: 1.5 }
    : { tier: 'high', textureWidth: 4096, bloom: true, dprCap: 2 }
}
