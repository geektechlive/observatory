/**
 * The aurora as one field (#50): OVATION's 1° cells go into an equirect texture that
 * a shell just above the Earth samples, instead of thousands of separate points.
 * Both globes share auroraAlpha(), so the WebGL and SVG ovals agree on brightness.
 */
import type { Vec3 } from './globe3d'

/**
 * One texel per whole degree, centred on it: OVATION cells sit on integer lon/lat, and
 * with texel edges there instead, float round-off flipped points into the next cell.
 * 181 rows so both poles have a row.
 */
export const FIELD_W = 360
export const FIELD_H = 181
export const AURORA_ALPHA_MAX = 0.45

/** OVATION intensity (about 4..29) to opacity; the SVG globe's scale. */
export function auroraAlpha(intensity: number): number {
  if (intensity <= 0) return 0
  return Math.min(AURORA_ALPHA_MAX, 0.07 + intensity / 70)
}

/** Texel index for a lon/lat: row 0 is the south pole (DataTexture is not flipped). */
export function fieldCell(lon: number, lat: number): number {
  const x = ((Math.round(lon + 180) % FIELD_W) + FIELD_W) % FIELD_W
  const y = Math.min(FIELD_H - 1, Math.max(0, Math.round(lat + 90)))
  return y * FIELD_W + x
}

/**
 * The shader's lookup, in TypeScript so it can be tested: the inverse of
 * latLonToVec3 on the shell's object-space position, plus half a texel so whole
 * degrees land on texel centres. Keep in step with auroraFragment in shaders.ts.
 */
export function fieldUv([x, y, z]: Vec3): [number, number] {
  const r = Math.hypot(x, y, z)
  const lat = (Math.asin(y / r) * 180) / Math.PI
  const lon = (Math.atan2(-z, x) * 180) / Math.PI
  return [(lon + 180.5) / FIELD_W, (lat + 90.5) / FIELD_H]
}

/** One byte of opacity per cell; the brightest point wins where two share a cell. */
export function auroraFieldData(
  points: readonly (readonly [number, number, number])[],
): Uint8Array {
  const data = new Uint8Array(FIELD_W * FIELD_H)
  for (const [lon, lat, intensity] of points) {
    const i = fieldCell(lon, lat)
    data[i] = Math.max(data[i] ?? 0, Math.round(auroraAlpha(intensity) * 255))
  }
  return data
}
