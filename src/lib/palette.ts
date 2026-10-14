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
import { gdacsStatus, nwsStatus, type Status } from './severity'

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
  bone: 'oklch(0.94 0.01 80)',
  boneDim: 'oklch(0.72 0.012 78)',
  boneFaint: 'oklch(0.62 0.012 75)',
  void: 'oklch(0.08 0.01 50)',
  copper2: 'oklch(0.55 0.14 45)',
  copperGlow: 'oklch(0.78 0.14 55)',
  brass: 'oklch(0.82 0.14 80)',
  globeDeep: 'oklch(0.3 0.06 48)',
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
/** Label ink for canvas-drawn nameplates on the globe (text wears ink, never the series colour). */
export const BONE_HEX = hexOf(TOKEN_OKLCH.bone)
/**
 * Sky bodies, shared by PlanetsPanel, SunMoonPanel and SkyStage so the three can't drift.
 * Mars is rust, not --mcrn: hazard red means hazard only (rule 3).
 */
export const BODY_HEX: Readonly<Record<string, string>> = {
  Sun: hexOf('oklch(0.9 0.16 90)'),
  Moon: hexOf('oklch(0.9 0.02 250)'),
  Mercury: hexOf('oklch(0.72 0.03 70)'),
  Venus: hexOf('oklch(0.92 0.08 95)'),
  Mars: hexOf('oklch(0.68 0.17 40)'),
  Jupiter: hexOf('oklch(0.78 0.09 70)'),
  Saturn: hexOf('oklch(0.85 0.08 95)'),
  Uranus: hexOf('oklch(0.82 0.1 200)'),
  Neptune: hexOf('oklch(0.65 0.15 250)'),
}

/** The moon disc: its dark side and its lit limb. */
export const MOON_DISC_HEX = {
  dark: hexOf('oklch(0.18 0.01 250)'),
  lit: hexOf('oklch(0.92 0.03 95)'),
}

/** StarField canvas: emissive points in the void, so a cool star is fine (they aren't structure). */
export const STAR_HEX = { warm: hexOf('oklch(0.82 0.1 70)'), cool: hexOf('oklch(0.85 0.08 220)') }
/** Aurora is a field with a single-hue ramp, not a marker lane. */
export const AURORA_HEX = hexOf('oklch(0.8 0.17 150)')
/** HUD lines: the terminator swatch and the SVG globe's tracking-mode outlines. */
export const HUD_HEX = hexOf(TOKEN_OKLCH.boneFaint)
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

/** No reading (null magnitude, unknown altitude or temperature): faint ink, not a data colour. */
export const MUTED_HEX = hexOf(TOKEN_OKLCH.boneFaint)
/** Marker halo so glyphs hold contrast over copper land and city lights (Codex finding 13). */
export const VOID_HEX = hexOf('oklch(0.08 0.01 50)')

/** `#rrggbb` plus an alpha in [0, 1] as `#rrggbbaa`, for SVG attributes and canvas fills. */
export function withAlpha(hex: string, alpha: number): string {
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
  return `${hex}${a.toString(16).padStart(2, '0')}`
}

/**
 * The SVG fallback globe's housing (#57). SVG attributes can't take color-mix(), so the
 * sphere, graticule and terminator come from here. Land is copper; in tracking mode the
 * outlines go HUD-neutral. Data layers never read from this block.
 */
export const SVG_GLOBE_HEX = {
  land: hexOf(TOKEN_OKLCH.copper2),
  landTracking: HUD_HEX,
  sphereHigh: hexOf('oklch(0.22 0.05 50)'),
  sphereMid: hexOf('oklch(0.12 0.025 50)'),
  sphereLow: hexOf('oklch(0.05 0.005 50)'),
  twilight: hexOf('oklch(0.10 0.02 250)'),
  terminator: hexOf('oklch(0.75 0.08 250)'),
  sunGlow: hexOf('oklch(0.92 0.13 90)'),
  sunCore: hexOf('oklch(0.98 0.06 90)'),
} as const

/** The Sky stage's chart background, a deep blue well, as gradient stops. */
export const SKY_WELL_HEX = {
  centre: hexOf('oklch(0.16 0.04 250)'),
  mid: hexOf('oklch(0.09 0.03 255)'),
  rim: hexOf('oklch(0.05 0.02 260)'),
} as const

/** Quakes sit in the geophysical lane; magnitude is drawn as size, never as colour. */
export function quakeMapColor(mag: number | null): string {
  return mag === null ? MUTED_HEX : LANES.geo.emit
}

export function gdacsColor(level: string): string {
  return STATUS_HEX[gdacsStatus(level)]
}

/** Fires sit in the thermal lane; radiative power is drawn as size. */
export function fireMapColor(): string {
  return LANES.thermal.emit
}

/**
 * US-EPA PM2.5 (µg/m³) bands. A recognised standard, so all six bands stay, redrawn
 * on the site's status family (owner pick: status scale) with the band label always shown.
 */
const AQI_BANDS: readonly (readonly [number, string])[] = [
  [12, STATUS_HEX.nominal],
  [35.4, hexOf('oklch(0.88 0.15 95)')],
  [55.4, STATUS_HEX.watch],
  [150.4, hexOf('oklch(0.72 0.17 50)')],
  [250.4, STATUS_HEX.hazard],
]
const AQI_HAZARDOUS = hexOf('oklch(0.5 0.2 18)')

export function aqiColor(pm25: number): string {
  return AQI_BANDS.find(([max]) => pm25 <= max)?.[1] ?? AQI_HAZARDOUS
}

/** Aircraft are not spacecraft, so altitude is a neutral bone lightness ramp. */
const ALT_STEPS = [
  hexOf('oklch(0.62 0.012 75)'),
  hexOf('oklch(0.78 0.012 78)'),
  hexOf('oklch(0.94 0.01 80)'),
]
export function altitudeColor(altM: number | null): string {
  if (altM === null) return MUTED_HEX
  if (altM < 3000) return ALT_STEPS[0] ?? MUTED_HEX
  if (altM < 9000) return ALT_STEPS[1] ?? MUTED_HEX
  return ALT_STEPS[2] ?? MUTED_HEX
}

/** Sea temperature diverges: hydro lane (cold), neutral bone midpoint, thermal lane (warm). */
const SST_MID = hexOf('oklch(0.86 0.01 80)')
export function sstColor(t: number | null): string {
  if (t === null) return MUTED_HEX
  if (t <= 10) return LANES.hydro.emit
  if (t <= 24) return SST_MID
  return LANES.thermal.emit
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

type Linear = readonly [number, number, number]

/**
 * The Earth shader's copper grade (spec section 5), as linear RGB uniforms. Mirrored
 * from tokens.css by test; the shader must not read getComputedStyle, which returns
 * oklch() strings three.js can't parse (Codex finding 6).
 */
export const GLOBE_GRADE: {
  readonly shadow: Linear
  readonly deep: Linear
  readonly mid: Linear
  readonly high: Linear
  readonly night: Linear
  readonly mix: number
} = {
  shadow: hexToLinear(hexOf(TOKEN_OKLCH.void)),
  deep: hexToLinear(hexOf(TOKEN_OKLCH.globeDeep)),
  mid: hexToLinear(hexOf(TOKEN_OKLCH.copper2)),
  high: hexToLinear(hexOf(TOKEN_OKLCH.copperGlow)),
  night: hexToLinear(hexOf(TOKEN_OKLCH.brass)),
  mix: 0.94,
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
