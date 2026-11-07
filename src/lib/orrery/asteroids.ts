/**
 * This fortnight's close approaches in the orrery (#92; spec Part 12). Positions are
 * Hermite on each object's Horizons samples (ephemeris.ts) and never extrapolated.
 * Anything relative to Earth uses Horizons' own Earth from /api/orrery-bodies: the
 * Kepler model is the Earth–Moon barycentre, about 4,700 km off, which is visible at
 * these distances, so without a Horizons Earth an approach is not placed at all.
 */
import type { OrreryTrack } from '@/schemas/orreryBodies'
import type {
  NeoccCloseApproach,
  NeoccRiskEntry,
  OrreryApproach,
  OrreryNeo,
} from '@/schemas/orreryNeo'

import { rangeRateFromStates, stateAt } from './ephemeris'
import type { Vec3 } from './scale'
import { AU_KM, lightTimeSeconds } from './units'

export interface AsteroidGeocentric {
  /** Heliocentric position and velocity (au, au/day). */
  helio: Vec3
  /** Geocentric vector, au. */
  rel: Vec3
  distAu: number
  /** km/s; negative while approaching. */
  rangeRateKmS: number
  lightSeconds: number
}

/**
 * A label from JPL's full name: "524522 Zoozve (2002 VE68)" → "Zoozve", "(2026 UE2)" →
 * "2026 UE2"; a numbered object with no name keeps its number and designation.
 */
export function shortName(full: string): string {
  const name = full.trim()
  const named = /^\d+\s+([^(\s][^(]*?)\s*\(/.exec(name)
  if (named?.[1]) return named[1]
  const bare = /^\((.+)\)$/.exec(name)
  return bare?.[1] ?? name
}

/** Heliocentric state from the object's samples, or null outside them. */
export function asteroidState(a: OrreryApproach, jd: number) {
  return a.fine ? stateAt({ fine: a.fine, coarse: null }, jd) : null
}

/** Where the object is relative to Horizons' Earth, or null with no data for the date. */
export function asteroidGeocentric(
  a: OrreryApproach,
  earthTrack: OrreryTrack | null,
  jd: number,
): AsteroidGeocentric | null {
  const s = asteroidState(a, jd)
  const e = earthTrack?.fine ? stateAt({ fine: earthTrack.fine, coarse: null }, jd) : null
  if (!s || !e) return null
  const rel = {
    x: s.position.x - e.position.x,
    y: s.position.y - e.position.y,
    z: s.position.z - e.position.z,
  }
  const distAu = Math.hypot(rel.x, rel.y, rel.z)
  return {
    helio: s.position,
    rel,
    distAu,
    rangeRateKmS: rangeRateFromStates(s.position, s.velocity, e.position, e.velocity),
    lightSeconds: lightTimeSeconds(distAu * AU_KM),
  }
}

/** Golden-section refinement steps inside the bracketing sample interval. */
const REFINE_STEPS = 40

/**
 * The object's closest approach to Earth within its samples: the nearest sample, then a
 * golden-section search between its neighbours. Null when they never overlap Earth's.
 */
export function closestApproachFromSamples(
  a: OrreryApproach,
  earthTrack: OrreryTrack | null,
): { jd: number; distAu: number } | null {
  const span = a.fine
  if (!span) return null
  const n = Math.floor(span.samples.length / 6)
  const dist = (jd: number) => asteroidGeocentric(a, earthTrack, jd)?.distAu ?? Infinity
  let best = -1
  let bestD = Infinity
  for (let i = 0; i < n; i += 1) {
    const d = dist(span.start + i * span.step)
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  if (best < 0) return null
  const g = (Math.sqrt(5) - 1) / 2
  let lo = span.start + Math.max(0, best - 1) * span.step
  let hi = span.start + Math.min(n - 1, best + 1) * span.step
  for (let k = 0; k < REFINE_STEPS; k += 1) {
    const m1 = hi - g * (hi - lo)
    const m2 = lo + g * (hi - lo)
    if (dist(m1) < dist(m2)) hi = m2
    else lo = m1
  }
  const jd = (lo + hi) / 2
  return { jd, distAu: dist(jd) }
}

/**
 * Size range from absolute magnitude H, metres, when no measured diameter exists:
 * D = 1329 km / √p · 10^(−H/5), for geometric albedos 0.25 (small, bright) to 0.05
 * (large, dark), the range usually quoted for near-Earth asteroids.
 */
export function diameterRangeM(h: number): [number, number] {
  const d = (albedo: number) => (1329 / Math.sqrt(albedo)) * 10 ** (-h / 5) * 1000
  return [d(0.25), d(0.05)]
}

/** The closest-approach window around the date shown (data covers about ±10 days). */
export type NeoWindow = 'day' | 'week' | 'all'

export interface NeoFilter {
  window: NeoWindow
  hazardousOnly: boolean
  riskListedOnly: boolean
}

export const DEFAULT_NEO_FILTER: NeoFilter = {
  window: 'all',
  hazardousOnly: false,
  riskListedOnly: false,
}

const WINDOW_DAYS: Record<NeoWindow, number> = { day: 1, week: 7, all: Infinity }

/** Whether an approach passes the filter at a Julian date. */
export function approachPasses(a: OrreryApproach, f: NeoFilter, jd: number): boolean {
  if (f.hazardousOnly && !a.pha) return false
  if (f.riskListedOnly && !a.riskListed) return false
  return Math.abs(a.closeApproach.jd - jd) <= WINDOW_DAYS[f.window]
}

/** ESA NEOCC writes designations like JPL once normalised (closeApproach.ts). */
export function riskEntryFor(neo: OrreryNeo, a: OrreryApproach): NeoccRiskEntry | undefined {
  return neo.esa.riskList?.entries.find((e) => e.key === a.des)
}

export function esaApproachFor(neo: OrreryNeo, a: OrreryApproach): NeoccCloseApproach | undefined {
  return neo.esa.closeApproaches?.entries.find((e) => e.key === a.des)
}

export type ImpactTermId = 'near' | 'hazardous' | 'modelled' | 'impact'

export interface ImpactTerm {
  id: ImpactTermId
  label: string
  applies: boolean
  /** Plain words: what this means for this object. */
  detail: string
}

const LD = 384_400

/**
 * Spec Part 12's four categories, kept apart: passing near Earth, the hazardous
 * designation, a modelled impact chance and an actual impact are not the same thing.
 */
export function impactTerms(a: OrreryApproach, risk: NeoccRiskEntry | undefined): ImpactTerm[] {
  const ld = (a.closeApproach.distAu * AU_KM) / LD
  const modelled = risk !== undefined || a.riskListed
  const chance =
    risk?.ipMax != null
      ? `ESA's model gives at most 1 in ${Math.round(1 / risk.ipMax).toLocaleString('en-US')}${risk.impactDate ? ` for ${risk.impactDate.slice(0, 10)}` : ''}${risk.torino != null ? `, Torino ${String(risk.torino)}` : ''}. A model output, not a prediction of a hit; it usually drops to zero as observations come in.`
      : 'On ESA’s risk list: a model output, not a prediction of a hit.'
  return [
    {
      id: 'near',
      label: 'Passes near Earth',
      applies: true,
      detail: `Closest ${ld < 10 ? ld.toFixed(2) : ld.toFixed(1)} lunar distances on ${a.closeApproach.date.slice(0, 10)} (JPL CAD).`,
    },
    {
      id: 'hazardous',
      label: 'Potentially hazardous',
      applies: a.pha,
      detail: a.pha
        ? 'A label for size and orbit: bigger than about 140 m, with an orbit that comes within 0.05 au of Earth’s. It says nothing about a hit.'
        : 'Not on JPL’s potentially hazardous list.',
    },
    {
      id: 'modelled',
      label: 'Modelled impact chance',
      applies: modelled,
      detail: modelled ? chance : 'ESA’s risk list has no entry for it.',
    },
    {
      id: 'impact',
      label: 'Confirmed impact',
      applies: false,
      detail: 'It has not hit Earth.',
    },
  ]
}
