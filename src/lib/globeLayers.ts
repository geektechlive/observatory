/**
 * The WebGL globe's data layers as a plain plan (#49): positions, colours, sizes and
 * glyphs for every row of the parity matrix (#44). Pure and tested; the renderer
 * only turns a plan into three.js objects. Colours come from palette.ts only, and
 * magnitude is drawn as size, never as colour within a lane (spec section 4).
 */
import { altToRadius, latLonToVec3 } from './globe3d'
import { AURORA_HEX, eonetKind, gdacsColor, ISS_HEX, LANES } from './palette'

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
  /** OVATION [lon, lat, intensity 0..1] triplets. */
  aurora: readonly (readonly [number, number, number])[]
  tracking: boolean
}

export type Glyph =
  | { shape: 'letter'; letter: string }
  | { shape: 'star' }
  | { shape: 'chevron' }
  | { shape: 'diamond' }
  | { shape: 'station' }

export interface PlannedMarker {
  layer: 'events' | 'fireballs' | 'launches' | 'disasters' | 'stations'
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
  layer: 'fires' | 'satellites' | 'aurora'
  position: Vec3
  color: string
  size: number
  alpha: number
}

export interface LayerPlan {
  iss: { position: Vec3; color: string } | null
  trail: Vec3[]
  markers: PlannedMarker[]
  spikes: PlannedSpike[]
  points: PlannedPoint[]
}

/** Markers sit just off the surface so they never z-fight the Earth. */
const SURFACE = 1.008
const AURORA_SHELL = 1.012
const DEFAULT_SAT_ALT_KM = 550
/** OVATION is a dense grid: normal blending converges on the aurora green instead of climbing to white. */
const AURORA_ALPHA = 0.35

/** Quake spike height, globe radii: M4 is a stub, M8 stands tall; unknown is a stub. */
export function spikeHeight(mag: number | null): number {
  if (mag === null) return 0.01
  return 0.02 + 0.13 * Math.min(Math.max((mag - 4) / 4, 0), 1)
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
      label: `${kind.label} at ${e.lat.toFixed(1)}°, ${e.lon.toFixed(1)}°`,
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
    label: `M${q.mag?.toFixed(1) ?? '?'} ${q.place}`,
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
  for (const s of input.satellites) {
    points.push({
      layer: 'satellites',
      position: latLonToVec3(s.lat, s.lon, altToRadius(s.alt ?? DEFAULT_SAT_ALT_KM)),
      color: LANES.orbital.emit,
      size: 0.018,
      alpha: 0.9,
    })
  }
  for (const [lon, lat, intensity] of input.aurora) {
    points.push({
      layer: 'aurora',
      position: latLonToVec3(lat, lon, AURORA_SHELL),
      color: AURORA_HEX,
      size: 0.035,
      alpha: Math.min(Math.max(intensity, 0), 1) * AURORA_ALPHA,
    })
  }

  const issRadius = altToRadius(input.iss?.alt ?? 0)
  return {
    iss: input.iss
      ? { position: latLonToVec3(input.iss.lat, input.iss.lon, issRadius), color: ISS_HEX }
      : null,
    trail: input.iss ? input.trail.map(([lon, lat]) => latLonToVec3(lat, lon, issRadius)) : [],
    markers,
    spikes,
    points,
  }
}
