/**
 * The data palette: one source for every surface that colours data (ROCI v2 spec section 4, #38).
 *
 * Globe markers, the world map, the legend, LayerControl, the ticker and the spine all
 * read from here. Values are hex because MapLibre's colour parser rejects oklch()
 * (checked against style-spec 26.4.4) and the shader needs numbers; CSS gets the same
 * values as --data-* custom properties through the generated src/styles/palette.css,
 * which a unit test keeps in step with renderPaletteCss().
 *
 * Five lanes group layers by kind of phenomenon. The chart steps pass every CVD and
 * normal-vision check (all pairs). The emissive steps, drawn bright on the dark globe
 * alongside ISS cyan and hazard red, cannot clear every floor (worst CVD 6.5, normal
 * 14.3), so on the globe glyph shape is mandatory, not decoration.
 */
import type { LayerKey } from '@/store/ui'

import { oklchToHex, parseOklch } from './color'
import { nwsStatus, type Status } from './severity'

export type Lane = 'orbital' | 'thermal' | 'space' | 'geo' | 'hydro'

export interface LaneDef {
  readonly label: string
  /** Validated for charts and swatches. */
  readonly chart: string
  /** Same family lifted for glowing markers on the dark globe and map. */
  readonly emit: string
}

export const LANES: Readonly<Record<Lane, LaneDef>> = {
  orbital: { label: 'Orbital', chart: '#0a7d87', emit: '#08a8ab' },
  thermal: { label: 'Thermal', chart: '#bd3701', emit: '#ff8d3e' },
  space: { label: 'Space objects', chart: '#c94db9', emit: '#ca6ded' },
  geo: { label: 'Geophysical', chart: '#be8907', emit: '#fbc60e' },
  hydro: { label: 'Hydro and weather', chart: '#0192ff', emit: '#9ea8ff' },
}

/** Literals mirrored from tokens.css; the palette test fails if either side drifts. */
export const TOKEN_OKLCH = {
  terminal: 'oklch(0.78 0.18 145)',
  amber: 'oklch(0.84 0.16 80)',
  mcrn: 'oklch(0.64 0.2 27)',
  signal: 'oklch(0.85 0.13 220)',
  boneDim: 'oklch(0.72 0.012 78)',
  boneFaint: 'oklch(0.62 0.012 75)',
} as const

const hexOf = (literal: string): string => {
  const parsed = parseOklch(literal)
  if (!parsed) throw new Error(`palette: not an oklch literal: ${literal}`)
  return oklchToHex(parsed)
}

export const STATUS_HEX: Readonly<Record<Status, string>> = {
  nominal: hexOf(TOKEN_OKLCH.terminal),
  watch: hexOf(TOKEN_OKLCH.amber),
  hazard: hexOf(TOKEN_OKLCH.mcrn),
}

export const ISS_HEX = hexOf(TOKEN_OKLCH.signal)
/** Aurora is a field with a single-hue ramp, not a marker lane. */
export const AURORA_HEX = hexOf('oklch(0.8 0.17 150)')
const HUD_HEX = hexOf(TOKEN_OKLCH.boneFaint)
const NEUTRAL_HEX = hexOf(TOKEN_OKLCH.boneDim)

export type Swatch =
  | { kind: 'lane'; lane: Lane }
  | { kind: 'iss' }
  | { kind: 'aurora' }
  | { kind: 'status' }
  | { kind: 'hud' }
  | { kind: 'neutral' }

/** What colour family each toggleable layer belongs to. */
export const LAYER_SWATCH: Readonly<Record<LayerKey, Swatch>> = {
  iss: { kind: 'iss' },
  events: { kind: 'neutral' }, // EONET spans lanes; each event takes its kind's lane
  quakes: { kind: 'lane', lane: 'geo' },
  terminator: { kind: 'hud' },
  fires: { kind: 'lane', lane: 'thermal' },
  disasters: { kind: 'status' },
  satellites: { kind: 'lane', lane: 'orbital' },
  fireballs: { kind: 'lane', lane: 'space' },
  launches: { kind: 'lane', lane: 'orbital' },
  gibs: { kind: 'neutral' },
  air: { kind: 'status' },
  nws: { kind: 'status' },
  aircraft: { kind: 'neutral' },
  buoys: { kind: 'lane', lane: 'hydro' },
  aurora: { kind: 'aurora' },
}

/** One representative colour for a swatch (legend dot, LayerControl). Status shows its hazard step. */
export function swatchColor(swatch: Swatch): string {
  switch (swatch.kind) {
    case 'lane':
      return LANES[swatch.lane].emit
    case 'iss':
      return ISS_HEX
    case 'aurora':
      return AURORA_HEX
    case 'status':
      return STATUS_HEX.hazard
    case 'hud':
      return HUD_HEX
    case 'neutral':
      return NEUTRAL_HEX
  }
}

/**
 * NWS alert fill colour, derived on the client from severity (owner pick: status scale).
 * Phase 1 of moving colour off the server: the API still sends `color` for tabs
 * already open on the old bundle; it is ignored here and dropped after one cache window.
 */
export function nwsColor(severity: string): string {
  return STATUS_HEX[nwsStatus(severity).status]
}

export interface EonetKindDef {
  readonly lane: Lane
  readonly label: string
  readonly letter: string
}

const WILDFIRE: EonetKindDef = { lane: 'thermal', label: 'Wildfire', letter: 'F' }

export const EONET_KINDS: Readonly<Record<string, EonetKindDef>> = {
  wildfires: WILDFIRE,
  fire: WILDFIRE,
  volcanoes: { lane: 'thermal', label: 'Volcano', letter: 'V' },
  earthquakes: { lane: 'geo', label: 'Earthquake', letter: 'E' },
  landslides: { lane: 'geo', label: 'Landslide', letter: 'L' },
  drought: { lane: 'geo', label: 'Drought', letter: 'D' },
  severeStorms: { lane: 'hydro', label: 'Severe Storm', letter: 'S' },
  floods: { lane: 'hydro', label: 'Flood', letter: 'W' },
  seaLakeIce: { lane: 'hydro', label: 'Sea/Lake Ice', letter: 'I' },
}

export function eonetKind(kind: string): EonetKindDef {
  return EONET_KINDS[kind] ?? { lane: 'geo', label: kind, letter: '?' }
}

/**
 * Count events by the category their dot is coloured by (the first one).
 * The legend used to count every category on an event while the map coloured
 * by categories[0], so legend totals and dot colours could disagree.
 */
export function primaryCategoryCounts(
  events: readonly { categories: readonly { id: string }[] }[],
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const event of events) {
    const id = event.categories[0]?.id
    if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  return counts
}

const decode = (v: number): number => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)

/** sRGB hex to linear-light RGB in [0, 1], for WebGL uniforms. */
export function hexToLinear(hex: string): [number, number, number] {
  const ch = (i: number): number => decode(parseInt(hex.slice(i, i + 2), 16) / 255)
  return [ch(1), ch(3), ch(5)]
}

/** The CSS mirror of this module, written to src/styles/palette.css. */
export function renderPaletteCss(): string {
  const lines = [
    '/* GENERATED from src/lib/palette.ts by tests/unit/palette.test.ts. Do not edit.',
    '   Regenerate with: pnpm exec vitest run tests/unit/palette.test.ts -u */',
    ':root {',
  ]
  for (const [key, lane] of Object.entries(LANES)) {
    lines.push(`  --data-${key}: ${lane.chart};`, `  --data-${key}-emit: ${lane.emit};`)
  }
  lines.push(`  --data-iss: ${ISS_HEX};`, `  --data-aurora: ${AURORA_HEX};`, '}', '')
  return lines.join('\n')
}
