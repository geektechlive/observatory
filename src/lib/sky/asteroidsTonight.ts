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
import { compassPoint } from '@/lib/compass'
import { asteroidMagnitude, phaseAngleDeg } from '@/lib/orrery/smallBodies'

import { MIN_ALTITUDE } from './cometsTonight'
import { type Observer, type Sampled, topocentric } from './topocentric'

/** Fainter than this forecast V is not listed (owner's decision, 2026-11-12). */
export const FAINTEST_ASTEROID_LISTED = 11
/** At most this many are listed (owner's decision, 2026-11-12). */
export const MAX_ASTEROIDS_LISTED = 10
const STEP_MS = 10 * 60_000

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

/** Where a body stands through a window: the stretch above `MIN_ALTITUDE` and its peak. */
export interface SkyRun {
  /** The first and last 10-minute sample of the stretch (not exact rise and set). */
  from: Date
  to: Date
  /** The sample where it stands highest, and where. */
  best: Date
  altitude: number
  azimuth: number
  direction: string
  /** Distances at `best`, for the magnitude law. */
  r: number
  delta: number
  earthSun: number
}

/**
 * The stretch of the window it is above `MIN_ALTITUDE`, sampled every 10 minutes; if it
 * rises twice, the stretch with the highest peak. Null if it never gets there or has no
 * samples tonight.
 */
export function skyRun(
  body: Sampled,
  observer: Observer,
  window: { start: Date; end: Date },
): SkyRun | null {
  let best: SkyRun | null = null
  let current: SkyRun | null = null
  for (let t = window.start.getTime(); t <= window.end.getTime(); t += STEP_MS) {
    const at = new Date(t)
    const sky = topocentric(body, at, observer)
    if (!sky || sky.altitude < MIN_ALTITUDE) {
      current = null
      continue
    }
    if (!current) {
      current = { ...here(at, sky), from: at, to: at }
      if (!best || current.altitude > best.altitude) best = current
      continue
    }
    current.to = at
    if (sky.altitude > current.altitude) Object.assign(current, here(at, sky))
    if (!best || current.altitude > best.altitude) best = current
  }
  return best && { ...best }
}

function here(at: Date, sky: NonNullable<ReturnType<typeof topocentric>>) {
  return {
    best: at,
    altitude: sky.altitude,
    azimuth: sky.azimuth,
    direction: compassPoint(sky.azimuth),
    r: sky.r,
    delta: sky.delta,
    earthSun: sky.earthSun,
  }
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
