/**
 * The real stars (#261): the Yale Bright Star Catalogue's brightest (lib/orrery/brightStars.ts)
 * as points on a sphere round the camera, so they sit at infinity in their true directions.
 * The fly-in shows them once the orrery is at true scale (#268).
 */
import {
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  type Object3D,
  Points,
  PointsMaterial,
} from 'three'

import { BRIGHT_STAR_STRIDE, BRIGHT_STARS } from '@/lib/orrery/brightStars'

/** Star point sizes, px, by magnitude band: brighter than 0, 1, 2, then the rest. */
const STAR_BANDS: readonly { maxMag: number; px: number }[] = [
  { maxMag: 0, px: 3.2 },
  { maxMag: 1, px: 2.6 },
  { maxMag: 2, px: 2 },
  { maxMag: Infinity, px: 1.5 },
]

/** A star's colour from its B-V index: blue-white near -0.3, white near 0.3, orange past 1.4. */
export function starColour(bv: number, vmag: number): Color {
  const t = Math.max(0, Math.min(1, (bv + 0.3) / 1.9))
  const c = new Color().setRGB(
    0.72 + 0.28 * Math.min(1, t * 1.8),
    0.8 + 0.2 * (1 - Math.abs(t - 0.35) * 1.5),
    1 - 0.55 * t,
  )
  // Fainter stars dimmer: 2.512 per magnitude, held so the faintest still show.
  const k = Math.max(0.35, Math.min(1, 2.512 ** -(vmag - 0.5) * 1.6))
  return c.multiplyScalar(k)
}

/** The star field, one Points per magnitude band, on a sphere of `radius` round the origin. */
export function buildStars(radius: number): Group {
  const group = new Group()
  group.name = 'stars'
  for (const [i, band] of STAR_BANDS.entries()) {
    const min = i === 0 ? -Infinity : (STAR_BANDS[i - 1]?.maxMag ?? -Infinity)
    const positions: number[] = []
    const colours: number[] = []
    for (let s = 0; s < BRIGHT_STARS.length; s += BRIGHT_STAR_STRIDE) {
      const [x = 0, y = 0, z = 0, v = 0, bv = 0] = BRIGHT_STARS.slice(s, s + BRIGHT_STAR_STRIDE)
      if (v <= min || v > band.maxMag) continue
      positions.push(x * radius, z * radius, -y * radius)
      const c = starColour(bv, v)
      colours.push(c.r, c.g, c.b)
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new Float32BufferAttribute(colours, 3))
    const material = new PointsMaterial({
      size: band.px,
      sizeAttenuation: false,
      vertexColors: true,
      depthWrite: false,
      // Tested against depth (writing none), so a planet or the Sun in front hides them.
      depthTest: true,
      transparent: true,
    })
    const points = new Points(geometry, material)
    points.frustumCulled = false
    points.renderOrder = -1
    group.add(points)
  }
  return group
}

/** Fade the field (0 to 1). */
export function setStarsOpacity(stars: Object3D, opacity: number): void {
  stars.visible = opacity > 0
  for (const child of stars.children) {
    const m = (child as Points<BufferGeometry, PointsMaterial>).material
    m.opacity = opacity
  }
}

/** Free the field's geometry and materials. */
export function disposeStars(stars: Object3D): void {
  for (const child of stars.children) {
    const p = child as Points<BufferGeometry, PointsMaterial>
    p.geometry.dispose()
    p.material.dispose()
  }
}
