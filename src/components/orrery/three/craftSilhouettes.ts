/**
 * Spacecraft silhouettes for the orrery at a distance (#115): our own outlines of each
 * craft's shape, drawn from NASA's models and public diagrams. Never an agency logo or
 * insignia (NASA: "not in the public domain"). SVG path data in a 32 x 32 box, absolute
 * commands only, filled in spacecraft cyan (palette.ts).
 */
import { CanvasTexture, SRGBColorSpace } from 'three'

import type { SilhouetteKey } from '@/lib/orrery/craftModels'
import { ISS_HEX } from '@/lib/palette'

export const SILHOUETTE_VIEWBOX = 32
/** Canvas px per silhouette; drawn at about 18 px, so 64 stays crisp on a 2x screen. */
const TEXTURE_PX = 64

/** A circle as two arcs. */
const circle = (cx: number, cy: number, r: number) =>
  `M${String(cx - r)} ${String(cy)} A${String(r)} ${String(r)} 0 1 0 ${String(cx + r)} ${String(cy)} A${String(r)} ${String(r)} 0 1 0 ${String(cx - r)} ${String(cy)} Z`

export const SILHOUETTE_PATHS: Readonly<Record<SilhouetteKey, string>> = {
  // A wide dish over a small bus, the magnetometer boom down-left, the RTG boom right.
  voyager:
    'M5 9 A11 4 0 0 1 27 9 A11 4 0 0 1 5 9 Z M13 12 H19 V16 H13 Z M13 14 L14.5 15 L3 30 L1.5 29 Z M19 13.5 H27 V15 H19 Z M26 12 H30 V16.5 H26 Z',
  // A dish on a triangular body, the RTG out to one side.
  'new-horizons':
    'M7 11 A9 3.5 0 0 1 25 11 A9 3.5 0 0 1 7 11 Z M9 14 H23 L16 25 Z M2 16 L9 17 V18.5 L2 17.5 Z',
  // A broad heat shield over a tapered body with two small wings.
  parker: 'M4 6 H28 V10 H4 Z M11 10 H21 L19 24 H13 Z M5 16 H11 V19 H5 Z M21 16 H27 V19 H21 Z',
  // Three long solar wings around a round hub.
  juno: `M18 14.8 H31 V17.2 H18 Z M16.04 13.67 L9.54 2.41 L7.46 3.61 L13.96 14.87 Z M16.04 18.33 L9.54 29.59 L7.46 28.39 L13.96 17.13 Z ${circle(16, 16, 3.2)}`,
  // Two very long arrays either side of a tall body with a dish on top.
  clipper:
    'M1 13 H12 V19 H1 Z M20 13 H31 V19 H20 Z M13 9 H19 V24 H13 Z M11.5 9 A4.5 2 0 0 1 20.5 9 Z',
  // A body between two X-shaped arrays.
  psyche:
    'M1 15 H11 V17 H1 Z M5 10 H7 V22 H5 Z M21 15 H31 V17 H21 Z M25 10 H27 V22 H25 Z M12 12 H20 V20 H12 Z',
  // Two big round arrays and a small body.
  lucy: `${circle(6, 16, 5.5)} ${circle(26, 16, 5.5)} M12 13 H20 V19 H12 Z`,
  // A heat shield over a box, two wings and a boom behind.
  'solar-orbiter':
    'M8 5 H24 V9 H8 Z M11 9 H21 V20 H11 Z M2 12 H11 V15 H2 Z M21 12 H30 V15 H21 Z M15.3 20 H16.7 V30 H15.3 Z',
  // A tall stack of modules with one long wing.
  bepicolombo: 'M12 3 H20 V29 H12 Z M20 9 H31 V14 H20 Z M8 18 H12 V24 H8 Z',
  // A hexagonal mirror on a kite-shaped sunshield.
  jwst: 'M2 22 L16 17 L30 22 L16 27 Z M22 11 L19 5.8 H13 L10 11 L13 16.2 H19 Z M15 16 H17 V19 H15 Z',
  // A box between two panels, a dish on top.
  dscovr: 'M11 11 H21 V21 H11 Z M2 13 H11 V19 H2 Z M21 13 H30 V19 H21 Z M13 11 A3 2 0 0 1 19 11 Z',
  // An octagonal drum with four panels in a cross, seen down the spin axis.
  ace: `${circle(16, 16, 5)} M21 14.5 H31 V17.5 H21 Z M1 14.5 H11 V17.5 H1 Z M14.5 1 H17.5 V11 H14.5 Z M14.5 21 H17.5 V31 H14.5 Z`,
  // A tall body between two long panel wings.
  soho: 'M12 5 H20 V27 H12 Z M1 14 H12 V18 H1 Z M20 14 H31 V18 H20 Z',
  // A drum with its long wire antennas.
  wind: `${circle(16, 16, 5)} M2 2.8 L2.8 2 L30 29.2 L29.2 30 Z M29.2 2 L30 2.8 L2.8 30 L2 29.2 Z`,
}

/**
 * The silhouette as a cyan-on-transparent texture, or null where the document cannot
 * draw (jsdom in unit tests, a lost context): the sprite then draws as a plain square.
 */
export function silhouetteTexture(
  key: SilhouetteKey,
  doc: Document = document,
): CanvasTexture | null {
  const canvas = doc.createElement('canvas')
  canvas.width = TEXTURE_PX
  canvas.height = TEXTURE_PX
  const ctx = canvas.getContext('2d')
  if (!ctx || typeof Path2D === 'undefined') return null
  const scale = TEXTURE_PX / SILHOUETTE_VIEWBOX
  ctx.scale(scale, scale)
  ctx.fillStyle = ISS_HEX
  ctx.fill(new Path2D(SILHOUETTE_PATHS[key]))
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}
