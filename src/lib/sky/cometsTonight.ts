/**
 * "What can I see tonight" for comets (#99), our stand-in for JPL's sb_obs, which does
 * not exist. For each comet the refresh job placed (and the interstellar objects, when
 * they have a magnitude law), where it stands in the user's sky through the dark
 * window, when it is highest, and how bright JPL's total-magnitude law makes it then.
 *
 * Comet magnitudes are forecasts from a two-number law fitted to past observations,
 * and comets often miss it by a magnitude or two; the panel says so.
 */
import { compassPoint } from '@/lib/compass'

import { type Observer, type Sampled, topocentric } from './topocentric'

/** Below this the sky near the horizon is too thick and too bright to look through. */
export const MIN_ALTITUDE = 10
/** Fainter than this needs more than a typical backyard telescope: not listed. */
export const FAINTEST_LISTED = 14
const STEP_MS = 10 * 60_000

/**
 * What it takes to see it, by total magnitude, from a dark site. A comet's light is
 * spread over its coma, so each limit is set a magnitude or two brighter than the usual
 * star limits (about 6.5 by eye, 10 in binoculars, 13 in a 4-inch and 14.5 in an
 * 8-inch telescope). An observers' rule of thumb, not a published standard.
 */
export type Reach = 'naked-eye' | 'binoculars' | 'small-telescope' | 'large-telescope'
const REACH_LIMITS: readonly (readonly [number, Reach])[] = [
  [6, 'naked-eye'],
  [9, 'binoculars'],
  [12, 'small-telescope'],
  [FAINTEST_LISTED, 'large-telescope'],
]

export function reachOf(magnitude: number): Reach | null {
  return REACH_LIMITS.find(([limit]) => magnitude <= limit)?.[1] ?? null
}

/** JPL's total-magnitude law: T = M1 + 5 log10 Δ + K1 log10 r (Δ, r in au). */
export function cometMagnitude(m1: number, k1: number, r: number, delta: number): number {
  return m1 + 5 * Math.log10(delta) + k1 * Math.log10(r)
}

export interface TonightCandidate extends Sampled {
  id: string
  name: string
  interstellar: boolean
  m1: number | null
  k1: number | null
}

export interface TonightComet {
  id: string
  name: string
  interstellar: boolean
  /** When it stands highest inside the dark window, and where. */
  best: Date
  altitude: number
  azimuth: number
  direction: string
  /** JPL's forecast total magnitude at `best`. */
  magnitude: number
  reach: Reach | null
}

export interface CometsTonight {
  /** Up and bright enough to list, brightest first. */
  visible: TonightComet[]
  /** The brightest one that is up but too faint to list, for an honest empty state. */
  brightestFaint: TonightComet | null
}

/** Its highest point above `MIN_ALTITUDE` in the window, or null if it never gets there. */
function highest(
  body: TonightCandidate & { m1: number; k1: number },
  observer: Observer,
  window: { start: Date; end: Date },
): TonightComet | null {
  let best: TonightComet | null = null
  for (let t = window.start.getTime(); t <= window.end.getTime(); t += STEP_MS) {
    const at = new Date(t)
    const sky = topocentric(body, at, observer)
    if (!sky || sky.altitude < MIN_ALTITUDE) continue
    if (best && sky.altitude <= best.altitude) continue
    const magnitude = cometMagnitude(body.m1, body.k1, sky.r, sky.delta)
    best = {
      id: body.id,
      name: body.name,
      interstellar: body.interstellar,
      best: at,
      altitude: sky.altitude,
      azimuth: sky.azimuth,
      direction: compassPoint(sky.azimuth),
      magnitude,
      reach: reachOf(magnitude),
    }
  }
  return best
}

/**
 * The comets worth going out for in the dark window, from the observer's place. An
 * object with no magnitude law (1I has only an asteroid's H) or no data tonight is
 * left out; nothing is extrapolated past its sampled span.
 */
export function cometsTonight(
  bodies: readonly TonightCandidate[],
  observer: Observer,
  window: { start: Date; end: Date },
): CometsTonight {
  const up: TonightComet[] = []
  for (const body of bodies) {
    const { m1, k1 } = body
    if (m1 === null || k1 === null) continue
    const found = highest({ ...body, m1, k1 }, observer, window)
    if (found) up.push(found)
  }
  up.sort((a, b) => a.magnitude - b.magnitude)
  return {
    visible: up.filter((c) => c.reach !== null),
    brightestFaint: up.find((c) => c.reach === null) ?? null,
  }
}
