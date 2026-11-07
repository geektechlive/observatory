/**
 * What the orrery says about a spacecraft at a moment (#93; spec Parts 8, 10, 16):
 * where it is, how far from the Sun and Earth, light time, range rate, and how much to
 * trust it. Positions come from JPL Horizons samples (ephemeris.ts). Earth comes from
 * the same Horizons answer when it covers the date, so the two are never from mixed
 * models; outside it, from JPL's approximate elements, and the reasons say so.
 */
import type { OrreryTrack } from '@/schemas/orreryBodies'

import { rangeRateFromStates, stateAt, type TrackState } from './ephemeris'
import { heliocentric } from './kepler'
import type { OrbitalState } from './model'
import type { Vec3 } from './scale'
import { AU_KM, lightTimeSeconds } from './units'

const JD_UNIX_EPOCH = 2440587.5
const DAY_MS = 86_400_000
/** Half-step for Earth's velocity from the Kepler model, days. */
const KEPLER_HALF_STEP = 1 / 24

export interface EarthState {
  position: Vec3
  velocity: Vec3
  source: 'horizons' | 'kepler'
}

/** Earth at a Julian date: Horizons where the payload covers it, else the Kepler model. */
export function earthState(earthTrack: OrreryTrack | null, jd: number): EarthState {
  const fromHorizons = earthTrack ? stateAt(earthTrack, jd) : null
  if (fromHorizons) return { ...fromHorizons, source: 'horizons' }
  const before = heliocentric('Earth', jd - KEPLER_HALF_STEP)
  const after = heliocentric('Earth', jd + KEPLER_HALF_STEP)
  const now = heliocentric('Earth', jd)
  const span = 2 * KEPLER_HALF_STEP
  return {
    position: { x: now.x, y: now.y, z: now.z },
    velocity: {
      x: (after.x - before.x) / span,
      y: (after.y - before.y) / span,
      z: (after.z - before.z) / span,
    },
    source: 'kepler',
  }
}

export interface CraftDescription {
  readonly state: OrbitalState
  readonly sunDistanceAu: number
  readonly earthDistanceAu: number
  readonly lightTimeFromEarthS: number
  /** Negative while approaching Earth. */
  readonly rangeRateKmS: number
  /** Past the date its trajectory rests on tracking data. */
  readonly predicted: boolean
  readonly resolution: TrackState['resolution']
  readonly earthSource: EarthState['source']
}

const isoFromJd = (jd: number) => new Date((jd - JD_UNIX_EPOCH) * DAY_MS).toISOString()

/** A spacecraft's state and the facts the inspector shows, or null with no data then. */
export function describeCraft(
  track: OrreryTrack,
  earthTrack: OrreryTrack | null,
  jd: number,
): CraftDescription | null {
  const s = stateAt(track, jd)
  if (!s) return null
  const earth = earthState(earthTrack, jd)
  const rel = {
    x: s.position.x - earth.position.x,
    y: s.position.y - earth.position.y,
    z: s.position.z - earth.position.z,
  }
  const earthDistanceAu = Math.hypot(rel.x, rel.y, rel.z)
  const observedUntilMs = track.observedUntil ? Date.parse(`${track.observedUntil}T23:59:59Z`) : NaN
  const sampleMs = (jd - JD_UNIX_EPOCH) * DAY_MS
  const predicted = Number.isFinite(observedUntilMs) && sampleMs > observedUntilMs

  const reasons: string[] = []
  if (predicted) {
    reasons.push(
      `A prediction beyond tracking data: Horizons' trajectory rests on tracking through ${String(track.observedUntil)}.`,
    )
  } else if (track.observedUntil) {
    reasons.push(
      `Within the tracked part of the trajectory (tracking through ${track.observedUntil}).`,
    )
  }
  reasons.push(
    s.resolution === 'fine'
      ? 'Interpolated between JPL Horizons samples (position and velocity, cubic Hermite).'
      : 'Interpolated between coarse whole-mission samples (positions only): good for the picture, rough for numbers.',
  )
  if (earth.source === 'kepler') {
    reasons.push(
      'Earth here is from JPL’s approximate elements: the Horizons samples for Earth do not cover this date.',
    )
  }

  return {
    sunDistanceAu: Math.hypot(s.position.x, s.position.y, s.position.z),
    earthDistanceAu,
    lightTimeFromEarthS: lightTimeSeconds(earthDistanceAu * AU_KM),
    rangeRateKmS: rangeRateFromStates(s.position, s.velocity, earth.position, earth.velocity),
    predicted,
    resolution: s.resolution,
    earthSource: earth.source,
    state: {
      timestampUTC: isoFromJd(jd),
      positionAu: s.position,
      velocityAuPerDay: s.velocity,
      referenceFrame: 'ecliptic J2000',
      referenceCenter: 'Sun',
      timeScale: 'TDB (UTC used; 69 s apart)',
      sourceType: 'ephemeris',
      sourceProvider: 'JPL Horizons',
      ...(track.observedUntil ? { sourceEpochUTC: track.observedUntil } : {}),
      accuracyDescription:
        s.resolution === 'fine'
          ? 'Horizons ephemeris, interpolated: within a few km of its own samples'
          : 'Horizons ephemeris, coarse samples: positions only',
      confidence: predicted || s.resolution === 'coarse' ? 'medium' : 'high',
      confidenceReasons: reasons,
    },
  }
}
