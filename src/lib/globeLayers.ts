/**
 * The WebGL globe's data layers as a plain plan (#49): positions, colours, sizes and
 * glyphs for every row of the parity matrix (#44). Pure and tested; the renderer
 * only turns a plan into three.js objects. Colours come from palette.ts only, and
 * magnitude is drawn as size, never as colour within a lane (spec section 4).
 */
import { auroraAlpha } from './auroraField'
import { type Reach, reachSegments } from './auroraReach'
import { altToRadius, latLonToVec3 } from './globe3d'
import { AURORA_HEX, eonetKind, gdacsColor, ISS_HEX, LANES, STATUS_HEX } from './palette'
import { gdacsStatus, quakeStatus } from './severity'

type Vec3 = [number, number, number]

/** NASA Deep Space Network ground stations, shown in the ORBIT tracking view. */
export const DSN_STATIONS: readonly { name: string; lat: number; lon: number }[] = [
  { name: 'GOLDSTONE', lat: 35.43, lon: -116.89 },
  { name: 'MADRID', lat: 40.43, lon: -4.25 },
  { name: 'CANBERRA', lat: -35.4, lon: 148.98 },
]

export interface LayerInput {
  iss: { lat: number; lon: number; alt: number } | null
  trail: readonly (readonly [number, number])[]
  events: readonly { lat: number; lon: number; kind: string }[]
  quakes: readonly { lat: number; lon: number; mag: number | null; place: string }[]
  fires: readonly { lat: number; lon: number; frp: number }[]
  fireballs: readonly { lat: number; lon: number; energy: number }[]
  launches: readonly { lat: number; lon: number; name: string }[]
  disasters: readonly { lat: number; lon: number; type: string; alert: string; name: string }[]
  satellites: readonly { name: string; lat: number; lon: number; alt?: number | undefined }[]
  /** OVATION [lon, lat, intensity] triplets; intensity runs about 4..29 (see auroraAlpha). */
  aurora: readonly (readonly [number, number, number])[]
  /** The oval's equatorward edge at 10% (likely) and 5% (possible), from /api/aurora (#77). */
  auroraReach?: { likely: Reach; possible: Reach } | undefined
  tracking: boolean
}

export type Glyph =
  | { shape: 'letter'; letter: string }
  | { shape: 'star' }
  | { shape: 'chevron' }
  | { shape: 'diamond' }
  | { shape: 'station' }
  | { shape: 'spacecraft'; name: string }

export interface PlannedMarker {
  layer: 'events' | 'fireballs' | 'launches' | 'disasters' | 'stations' | 'satellites'
  position: Vec3
  color: string
  glyph: Glyph
  /** Index into the focusable list for the a11y overlay (#48); events only. */
  focusIndex?: number | undefined
  label: string
}

export interface PlannedSpike {
  base: Vec3
  height: number
  color: string
  focusIndex: number
  label: string
}

export interface PlannedPoint {
  layer: 'fires' | 'aurora'
  position: Vec3
  color: string
  size: number
  alpha: number
}

/** An active hazard that glows (#50): bloom on the high tier, an additive sprite on low. */
export interface PlannedGlow {
  layer: 'events' | 'disasters' | 'quakes'
  position: Vec3
  color: string
}

export interface LayerPlan {
  iss: { position: Vec3; color: string; name: string } | null
  trail: Vec3[]
  markers: PlannedMarker[]
  spikes: PlannedSpike[]
  points: PlannedPoint[]
  glows: PlannedGlow[]
  /** OVATION cells for the aurora field texture (#50); `points` keeps the per-cell census. */
  aurora: LayerInput['aurora']
  /** How far the aurora reaches (#77): one polyline per contiguous run of the edge. */
  reach: PlannedReach[]
}

export interface PlannedReach {
  kind: 'likely' | 'possible'
  points: Vec3[]
  color: string
  alpha: number
  /** Line width in CSS pixels. */
  width: number
}

/** Markers sit just off the surface so they never z-fight the Earth. */
const SURFACE = 1.008
export const AURORA_SHELL = 1.012
/** The reach line rides just above the aurora field so the field never covers it. */
const REACH_SHELL = AURORA_SHELL + 0.001
const REACH_ALPHA = { likely: 0.9, possible: 0.5 } as const
const REACH_WIDTH = { likely: 2, possible: 1 } as const
const DEFAULT_SAT_ALT_KM = 550

/** Quake spike height, globe radii: M4 is a stub, M8 stands tall; unknown is a stub. */
export function spikeHeight(mag: number | null): number {
  if (mag === null) return 0.01
  return 0.02 + 0.13 * Math.min(Math.max((mag - 4) / 4, 0), 1)
}

/** Screen-reader labels, shared by the plan and the a11y overlay so they can't drift. */
export function eventLabel(e: { lat: number; lon: number; kind: string }): string {
  return `${eonetKind(e.kind).label} at ${e.lat.toFixed(1)}°, ${e.lon.toFixed(1)}°`
}

export function quakeLabel(q: { mag: number | null; place: string }): string {
  return `Earthquake M${q.mag?.toFixed(1) ?? '?'}, ${q.place}`
}

/** How many objects each layer draws; published on the canvas for e2e parity checks. */
export function layerCounts(plan: LayerPlan): Record<string, number> {
  const counts: Record<string, number> = {
    iss: plan.iss ? 1 : 0,
    trail: plan.trail.length,
    quakes: plan.spikes.length,
  }
  for (const m of plan.markers) counts[m.layer] = (counts[m.layer] ?? 0) + 1
  for (const p of plan.points) counts[p.layer] = (counts[p.layer] ?? 0) + 1
  return counts
}

export function planLayers(input: LayerInput): LayerPlan {
  const markers: PlannedMarker[] = []
  const points: PlannedPoint[] = []

  input.events.forEach((e, i) => {
    const kind = eonetKind(e.kind)
    markers.push({
      layer: 'events',
      position: latLonToVec3(e.lat, e.lon, SURFACE),
      color: LANES[kind.lane].emit,
      glyph: { shape: 'letter', letter: kind.letter },
      focusIndex: i,
      label: eventLabel(e),
    })
  })
  for (const f of input.fireballs) {
    markers.push({
      layer: 'fireballs',
      position: latLonToVec3(f.lat, f.lon, SURFACE),
      color: LANES.space.emit,
      glyph: { shape: 'star' },
      label: `Fireball, ${f.energy.toFixed(1)} kt`,
    })
  }
  for (const l of input.launches) {
    markers.push({
      layer: 'launches',
      position: latLonToVec3(l.lat, l.lon, SURFACE),
      color: LANES.orbital.emit,
      glyph: { shape: 'chevron' },
      label: l.name,
    })
  }
  for (const d of input.disasters) {
    markers.push({
      layer: 'disasters',
      position: latLonToVec3(d.lat, d.lon, SURFACE),
      color: gdacsColor(d.alert),
      glyph: { shape: 'diamond' },
      label: `${d.alert} alert: ${d.name}`,
    })
  }
  if (input.tracking) {
    for (const s of DSN_STATIONS) {
      markers.push({
        layer: 'stations',
        position: latLonToVec3(s.lat, s.lon, SURFACE),
        color: ISS_HEX,
        glyph: { shape: 'station' },
        label: `DSN ${s.name}`,
      })
    }
  }

  const spikes = input.quakes.map((q, i) => ({
    base: latLonToVec3(q.lat, q.lon, 1),
    height: spikeHeight(q.mag),
    color: LANES.geo.emit,
    focusIndex: i,
    label: quakeLabel(q),
  }))

  for (const f of input.fires) {
    points.push({
      layer: 'fires',
      position: latLonToVec3(f.lat, f.lon, SURFACE),
      color: LANES.thermal.emit,
      size: Math.min(0.05, 0.012 + Math.sqrt(Math.max(f.frp, 0)) * 0.0015),
      alpha: 0.9,
    })
  }
  // The feed tracks a few named spacecraft (Hubble, Tiangong), not a constellation,
  // so each is a labelled marker like the ISS rather than a point in a cloud.
  for (const s of input.satellites) {
    const alt = s.alt ?? DEFAULT_SAT_ALT_KM
    markers.push({
      layer: 'satellites',
      position: latLonToVec3(s.lat, s.lon, altToRadius(alt)),
      color: LANES.orbital.emit,
      glyph: { shape: 'spacecraft', name: s.name },
      label: `${s.name}, ${String(Math.round(alt))} km`,
    })
  }
  for (const [lon, lat, intensity] of input.aurora) {
    points.push({
      layer: 'aurora',
      position: latLonToVec3(lat, lon, AURORA_SHELL),
      color: AURORA_HEX,
      size: 0.035,
      alpha: auroraAlpha(intensity),
    })
  }

  const issRadius = altToRadius(input.iss?.alt ?? 0)
  return {
    iss: input.iss
      ? {
          position: latLonToVec3(input.iss.lat, input.iss.lon, issRadius),
          color: ISS_HEX,
          name: 'ISS',
        }
      : null,
    trail: input.iss ? input.trail.map(([lon, lat]) => latLonToVec3(lat, lon, issRadius)) : [],
    markers,
    spikes,
    points,
    glows: planGlows(input, markers, spikes),
    aurora: input.aurora,
    reach: planReach(input.auroraReach),
  }
}

/**
 * The aurora's reach (#77) in watch amber: the likely (10%) edge bold, the possible
 * (5%) edge faint. Each hemisphere's line breaks where nothing reaches the threshold.
 */
function planReach(reach: LayerInput['auroraReach']): PlannedReach[] {
  if (!reach) return []
  return (['likely', 'possible'] as const).flatMap((kind) =>
    [...reachSegments(reach[kind].n), ...reachSegments(reach[kind].s)].map((run) => ({
      kind,
      points: run.map(([lon, lat]) => latLonToVec3(lat, lon, REACH_SHELL)),
      color: STATUS_HEX.watch,
      alpha: REACH_ALPHA[kind],
      width: REACH_WIDTH[kind],
    })),
  )
}

/**
 * Active hazards (#50): every EONET event (the feed lists open events only), GDACS
 * orange and red, and quakes at watch or above (M4.5+). Severity thresholds come
 * from severity.ts, never from here.
 */
function planGlows(
  input: LayerInput,
  markers: readonly PlannedMarker[],
  spikes: readonly PlannedSpike[],
): PlannedGlow[] {
  const glows: PlannedGlow[] = []
  for (const m of markers) {
    if (m.layer === 'events') glows.push({ layer: 'events', position: m.position, color: m.color })
  }
  input.disasters.forEach((d) => {
    if (gdacsStatus(d.alert) === 'nominal') return
    glows.push({
      layer: 'disasters',
      position: latLonToVec3(d.lat, d.lon, SURFACE),
      color: gdacsColor(d.alert),
    })
  })
  input.quakes.forEach((q, i) => {
    const spike = spikes[i]
    if (q.mag === null || quakeStatus(q.mag) === 'nominal' || !spike) return
    const tip = 1 + spike.height
    glows.push({
      layer: 'quakes',
      position: [spike.base[0] * tip, spike.base[1] * tip, spike.base[2] * tip],
      color: spike.color,
    })
  })
  return glows
}
