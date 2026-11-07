/**
 * An object looked up at JPL and shown in the orrery (#145). The orrery asks
 * /api/trajectory (#100) for two years of Horizons samples around the sim date, two days
 * apart, and draws the object from them: Hermite between samples, never past them. The
 * span is fixed on a grid, so everyone looking at the same object that season shares one
 * cached answer, and a scrub of months needs no new request.
 *
 * Its orbit line is the osculating ellipse through its state now (an elliptic orbit),
 * which shows the whole loop even for Halley, whose two sampled years are a short arc;
 * an unbound object (3I/ATLAS) draws its sampled path instead.
 */
import type { OrreryTrack, SampledSpan } from '@/schemas/orreryBodies'

import { earthState } from './craftState'
import { rangeRateFromStates, stateAt } from './ephemeris'
import { osculatingLoop } from './moonOrbit'
import type { Vec3 } from './scale'
import { AU_KM, lightTimeSeconds } from './units'

const PREFIX = 'lookup:'
/** An SPK-ID is a number of up to eight or so digits; anything far past it is not one. */
const SPKID = /^\d{1,12}$/

/** The scene, search and link key for a looked-up object (`lookup:20099942`). */
export const lookupKey = (spkid: string) => `${PREFIX}${spkid}`

/** The SPK-ID in a lookup key, or null when the key is not one. */
export function lookupSpkid(key: string): string | null {
  if (!key.startsWith(PREFIX)) return null
  const id = key.slice(PREFIX.length)
  return SPKID.test(id) ? id : null
}

export const isLookupKey = (key: string) => lookupSpkid(key) !== null

/** Days between samples. */
export const LOOKUP_STEP_DAYS = 2
/** Days either side of the span's centre: 366 samples, inside the endpoint's 600. */
const HALF_SPAN_DAYS = 365
/** The span's centre moves on this grid, days; the date is always ≥ 305 days from an end. */
const GRID_DAYS = 120
const DAY_MS = 86_400_000
/** /api/trajectory's dates (src/lib/orrery/jplLookup.ts). */
const FIRST_DAY = '1900-01-01'
const LAST_DAY = '2100-12-31'

export interface LookupSpan {
  /** YYYY-MM-DD, as /api/trajectory takes them. */
  start: string
  end: string
  /** `<n>d`. */
  step: string
}

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const dayMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`)

/** The span to ask for around a sim time, or null outside 1900–2100. */
export function lookupSpan(simMs: number): LookupSpan | null {
  const first = dayMs(FIRST_DAY)
  const last = dayMs(LAST_DAY)
  if (!(simMs >= first && simMs < last + DAY_MS)) return null
  const day = Math.floor(simMs / DAY_MS)
  const centre = (Math.floor(day / GRID_DAYS) * GRID_DAYS + GRID_DAYS / 2) * DAY_MS
  let start = centre - HALF_SPAN_DAYS * DAY_MS
  let end = centre + HALF_SPAN_DAYS * DAY_MS
  if (start < first) {
    start = first
    end = first + 2 * HALF_SPAN_DAYS * DAY_MS
  } else if (end > last) {
    end = last
    start = last - 2 * HALF_SPAN_DAYS * DAY_MS
  }
  return { start: isoDay(start), end: isoDay(end), step: `${String(LOOKUP_STEP_DAYS)}d` }
}

/** Samples a span asks for, counted as /api/trajectory counts them. */
export function spanSampleCount(span: LookupSpan): number {
  const days = Number.parseInt(span.step, 10)
  return Math.floor((dayMs(span.end) - dayMs(span.start)) / (days * DAY_MS)) + 1
}

/** Whether a span answers for this Julian date. */
export function spanCovers(fine: SampledSpan, jd: number): boolean {
  return stateAt({ fine, coarse: null }, jd) !== null
}

export interface LookupDescription {
  /** Heliocentric ecliptic J2000, au and au/day. */
  position: Vec3
  velocity: Vec3
  sunDistanceAu: number
  earthDistanceAu: number
  lightTimeFromEarthS: number
  /** Negative while approaching Earth. */
  rangeRateKmS: number
  /** Where Earth came from: Horizons' own samples, or JPL's approximate elements. */
  earthSource: 'horizons' | 'kepler'
}

/** Where a looked-up object is, from its samples; null where none cover the date. */
export function describeLookup(
  fine: SampledSpan,
  earthTrack: OrreryTrack | null,
  jd: number,
): LookupDescription | null {
  const s = stateAt({ fine, coarse: null }, jd)
  if (!s) return null
  const earth = earthState(earthTrack, jd)
  const earthDistanceAu = Math.hypot(
    s.position.x - earth.position.x,
    s.position.y - earth.position.y,
    s.position.z - earth.position.z,
  )
  return {
    position: s.position,
    velocity: s.velocity,
    sunDistanceAu: Math.hypot(s.position.x, s.position.y, s.position.z),
    earthDistanceAu,
    lightTimeFromEarthS: lightTimeSeconds(earthDistanceAu * AU_KM),
    rangeRateKmS: rangeRateFromStates(s.position, s.velocity, earth.position, earth.velocity),
    earthSource: earth.source,
  }
}

/** The Sun's GM, au³/day²: Gauss's gravitational constant squared. */
const SUN_MU = 0.01720209895 ** 2
const ORBIT_POINTS = 256

export interface LookupOrbit {
  /** 'osculating': the whole ellipse through the state now; 'sampled': the span's path. */
  kind: 'osculating' | 'sampled'
  /** Heliocentric, au. An osculating loop starts at the object and closes on itself. */
  points: Vec3[]
}

/** The orbit line for a date, or null when no sample covers it. */
export function lookupOrbit(fine: SampledSpan, jd: number): LookupOrbit | null {
  const now = stateAt({ fine, coarse: null }, jd)
  if (!now) return null
  const loop = osculatingLoop(now.position, now.velocity, SUN_MU, ORBIT_POINTS)
  if (loop) return { kind: 'osculating', points: loop }
  const points: Vec3[] = []
  for (let i = 0; i + 5 < fine.samples.length; i += 6) {
    points.push({
      x: fine.samples[i] ?? 0,
      y: fine.samples[i + 1] ?? 0,
      z: fine.samples[i + 2] ?? 0,
    })
  }
  return { kind: 'sampled', points }
}
