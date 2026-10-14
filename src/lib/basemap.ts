/**
 * Warm hull retheme for CARTO's dark-matter vector basemap (ROCI v2, #41).
 *
 * v1 graded the whole map container with `filter: sepia(...)` plus a copper tint
 * overlay, which also shifted every data layer's colour. CARTO is a vector style,
 * so MapLibre's raster-* paint properties can't reach it (Codex finding 2): instead
 * we repaint the basemap's own background, fill and line layers once on style.load.
 * Data layers are never touched, so they keep their palette colours.
 */
import { oklchToHex, parseOklch } from './color'

const hex = (literal: string): string => {
  const parsed = parseOklch(literal)
  if (!parsed) throw new Error(`basemap: not an oklch literal: ${literal}`)
  return oklchToHex(parsed)
}

// Same family as the globe grade: dark bronze sea, hull land, quiet copper seams.
// In dark-matter the background layer is the land; water is a fill drawn over it.
const SEA = hex('oklch(0.09 0.012 50)')
const LAND = hex('oklch(0.24 0.035 55)')
const LAND_DETAIL = hex('oklch(0.26 0.037 55)')
const BORDER = hex('oklch(0.4 0.07 50)')
const SEAM = hex('oklch(0.3 0.03 55)')

export interface PaintOverride {
  readonly property: 'background-color' | 'fill-color' | 'line-color'
  readonly value: string
}

/** The paint changes for one basemap layer; empty for layers the basemap theme doesn't own. */
export function warmBasemapPaint(layer: { id: string; type: string }): PaintOverride[] {
  const id = layer.id.toLowerCase()
  const isWater = id.includes('water') || id.includes('ocean') || id.includes('lake')
  switch (layer.type) {
    case 'background':
      return [{ property: 'background-color', value: LAND }]
    case 'fill':
      if (isWater) return [{ property: 'fill-color', value: SEA }]
      if (id.includes('building') || id.includes('park') || id.includes('landuse'))
        return [{ property: 'fill-color', value: LAND_DETAIL }]
      return [{ property: 'fill-color', value: LAND }]
    case 'line':
      if (isWater) return [{ property: 'line-color', value: SEA }]
      if (id.includes('boundary') || id.includes('admin'))
        return [{ property: 'line-color', value: BORDER }]
      return [{ property: 'line-color', value: SEAM }]
    default:
      return []
  }
}
