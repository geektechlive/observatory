/**
 * Pixel clamps for markers sized in scene units (#195). A share-of-Earth marker grows
 * with Earth, so without a ceiling a big window shows a Moon bigger than the Sun, which
 * shrinks to its px floor in the Earth frame.
 */

/**
 * A scene radius held between `minPx` and `maxPx` on screen, given the scene units that
 * cover one px. The ceiling wins if the floor sits above it. No `maxPx`: floor only.
 */
export function clampRadius(
  radius: number,
  unitsPerPx: number,
  minPx: number,
  maxPx?: number,
): number {
  const floored = Math.max(radius, minPx * unitsPerPx)
  return maxPx === undefined ? floored : Math.min(floored, maxPx * unitsPerPx)
}

/**
 * On-screen radius ceilings, px. All sit under the Sun's 10 px floor radius (the least it
 * ever draws), ordered by how important the marker is: the Moon is the biggest thing near
 * Earth, a debris ring only has to read. The ring's 9 px is its own floor.
 */
export const PX_CEILING = {
  moon: 8,
  l1: 7,
  asteroid: 6,
  satMarker: 6,
  satReentry: 9,
} as const
