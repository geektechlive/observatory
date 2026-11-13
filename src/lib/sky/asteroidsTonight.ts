/**
 * "What can I see tonight" for the bright asteroids (#99 item 4), beside the comets
 * (cometsTonight.ts). For each asteroid the refresh job placed, when it stands above
 * `MIN_ALTITUDE` in the dark window, when and where it is highest, and how bright JPL's H
 * and G make it then.
 *
 * Asteroid brightness is an estimate from the H,G law (asteroidMagnitude), with G = 0.15
 * where JPL has none. Positions come from Horizons samples only: nothing is extrapolated,
 * and refraction is ignored, so the times are 10-minute samples, not rise and set.
 */
import { asteroidMagnitude, phaseAngleDeg } from '@/lib/orrery/smallBodies'

import { type Observer, type Sampled } from './topocentric'
import { type SkyRun, skyRun } from './track'

// The run-finding moved to track.ts (#99 item 5); these stay importable from here.
export { type SkyRun, skyRun }

/** Fainter than this forecast V is not listed (owner's decision, 2026-11-12). */
export const FAINTEST_ASTEROID_LISTED = 11
/** At most this many are listed (owner's decision, 2026-11-12). */
export const MAX_ASTEROIDS_LISTED = 10

/**
 * What it takes to see a point of light, by V magnitude, from a dark site: the usual star
 * limits, about 6.5 by eye, 10 in binoculars and 13 in a 4-inch telescope. Comets, being
 * spread out, use brighter limits (cometsTonight.ts); an asteroid does not.
 */
export type AsteroidReach = 'naked-eye' | 'binoculars' | 'small-telescope'
const REACH_LIMITS: readonly (readonly [number, AsteroidReach])[] = [
  [6.5, 'naked-eye'],
  [10, 'binoculars'],
  [13, 'small-telescope'],
]

export function asteroidReachOf(magnitude: number): AsteroidReach | null {
  return REACH_LIMITS.find(([limit]) => magnitude <= limit)?.[1] ?? null
}

export interface TonightAsteroidCandidate extends Sampled {
  id: string
  spkid: string
  name: string
  /** Absolute magnitude and slope; `gAssumed` where G is the 0.15 default. */
  h: number
  g: number
  gAssumed: boolean
}

export interface TonightAsteroid {
  id: string
  spkid: string
  name: string
  from: Date
  to: Date
  best: Date
  altitude: number
  azimuth: number
  direction: string
  /** The H,G estimate at `best`. */
  magnitude: number
  reach: AsteroidReach | null
  gAssumed: boolean
}

/** H,G magnitude at the point of a run where the body stands highest. */
export function magnitudeAt(body: { h: number; g: number }, run: SkyRun): number {
  const alpha = phaseAngleDeg(run.r, run.delta, run.earthSun)
  return asteroidMagnitude(body.h, body.g, run.r, run.delta, alpha)
}

/**
 * The asteroids worth going out for in the window: up, and forecast at
 * `FAINTEST_ASTEROID_LISTED` or brighter, brightest first, at most `MAX_ASTEROIDS_LISTED`.
 */
export function asteroidsTonight(
  bodies: readonly TonightAsteroidCandidate[],
  observer: Observer,
  window: { start: Date; end: Date },
): TonightAsteroid[] {
  const up: TonightAsteroid[] = []
  for (const body of bodies) {
    const run = skyRun(body, observer, window)
    if (!run) continue
    const magnitude = magnitudeAt(body, run)
    if (magnitude > FAINTEST_ASTEROID_LISTED) continue
    up.push({
      id: body.id,
      spkid: body.spkid,
      name: body.name,
      from: run.from,
      to: run.to,
      best: run.best,
      altitude: run.altitude,
      azimuth: run.azimuth,
      direction: run.direction,
      magnitude,
      reach: asteroidReachOf(magnitude),
      gAssumed: body.gAssumed,
    })
  }
  up.sort((a, b) => a.magnitude - b.magnitude)
  return up.slice(0, MAX_ASTEROIDS_LISTED)
}
