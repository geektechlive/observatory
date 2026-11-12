/**
 * An object looked up at JPL and shown in the orrery (#145). The orrery asks
 * /api/trajectory (#100) for two years of Horizons samples around the sim date, two days
 * apart, and draws the object from them: Hermite between samples, never past them. The
 * span is fixed on a grid, so everyone looking at the same object that season shares one
 * cached answer, and a scrub of months needs no new request. A span that passes within
 * 0.001 au of Earth asks for one more, 10-minute samples over the four days around the
 * pass (#215), drawn there in place of the 2-day ones.
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

const STEP_MINUTES: Record<string, number> = { m: 1, h: 60, d: 1440 }
/** Golden-section steps for the closest approach, and bisection steps for the window's edges. */
const REFINE_STEPS = 40

/** Samples a span asks for, counted as /api/trajectory counts them. */
export function spanSampleCount(span: LookupSpan): number {
  const m = /^(\d+)([mhd])$/.exec(span.step)
  const minutes = m ? Number(m[1]) * (STEP_MINUTES[m[2] ?? ''] ?? Number.NaN) : Number.NaN
  return Math.floor((dayMs(span.end) - dayMs(span.start)) / (minutes * 60_000)) + 1
}

/** Whether a span answers for this Julian date. */
export function spanCovers(fine: SampledSpan, jd: number): boolean {
  return stateAt({ fine, coarse: null }, jd) !== null
}

/**
 * A pass whose 2-day samples come within this of Earth, au, gets a dense span (#215), the
 * cut-off the close approaches use for theirs (#142).
 */
export const CLOSEST_MAX_AU = 0.001
/** The dense span's step: 10 minutes, as #142's. */
const CLOSEST_STEP = '10m'
const JD_UNIX_EPOCH = 2440587.5
const isoDayOfJd = (jd: number) => isoDay(Math.round(jd - JD_UNIX_EPOCH) * DAY_MS)

/**
 * Heliocentric state from a lookup's samples: the dense span around a close pass where it
 * covers the date (#215), else the 2-day span; null outside both, never extrapolated.
 */
export function lookupState(
  samples: { fine: SampledSpan; closest: SampledSpan | null },
  jd: number,
) {
  const dense = samples.closest ? stateAt({ fine: samples.closest, coarse: null }, jd) : null
  return dense ?? stateAt({ fine: samples.fine, coarse: null }, jd)
}

/**
 * The dense span to ask for when the 2-day samples pass within `maxAu` of Earth (#215), or
 * null. Two days at 10 minutes either side of the sample nearest closest approach: 4 days,
 * 577 samples, inside the endpoint's 600. Its ends are lookup samples, so the hand-over to
 * the 2-day Hermite is at a shared Horizons state, and it holds the whole stretch the 2-day
 * Hermite bends: on 2026 VQ11 (31,453 km) that Hermite is still 8,600 km off 6 h from
 * closest approach, so #142's ±6 h would leave a jump at each edge. Derived from the 2-day
 * samples alone, which every span of the object shares, so everyone asks for the same span.
 * `earthAt` may be approximate (JPL's elements away from Horizons' Earth): only the
 * decision and the window depend on it. A pass at either end of the span asks nothing; the
 * next span holds it.
 */
export function lookupClosestSpan(
  fine: SampledSpan,
  earthAt: (jd: number) => Vec3 | null,
  maxAu = CLOSEST_MAX_AU,
): LookupSpan | null {
  const n = Math.floor(fine.samples.length / 6)
  const at = (i: number) => fine.start + i * fine.step
  const dist = (jd: number): number => {
    const s = stateAt({ fine, coarse: null }, jd)
    const e = s ? earthAt(jd) : null
    if (!s || !e) return Infinity
    const p = s.position
    return Math.hypot(p.x - e.x, p.y - e.y, p.z - e.z)
  }
  const d = Array.from({ length: n }, (_, i) => dist(at(i)))
  let best = -1
  let bestD = Infinity
  // Every local minimum of the samples, refined on the Hermite between its neighbours: a
  // pass between two samples may read days away at both.
  for (let i = 1; i + 1 < n; i += 1) {
    const di = d[i] ?? Infinity
    if (!(di <= (d[i - 1] ?? Infinity) && di <= (d[i + 1] ?? Infinity))) continue
    const refined = closestBetween(dist, at(i - 1), at(i + 1))
    if (refined < bestD) {
      bestD = refined
      best = i
    }
  }
  if (best < 0 || !(bestD < maxAu)) return null
  return { start: isoDayOfJd(at(best - 1)), end: isoDayOfJd(at(best + 1)), step: CLOSEST_STEP }
}

/** The least of `dist` between `lo` and `hi`, by golden section. */
function closestBetween(dist: (jd: number) => number, lo: number, hi: number): number {
  const g = (Math.sqrt(5) - 1) / 2
  let a = lo
  let b = hi
  for (let k = 0; k < REFINE_STEPS; k += 1) {
    const m1 = b - g * (b - a)
    const m2 = a + g * (b - a)
    if (dist(m1) < dist(m2)) b = m2
    else a = m1
  }
  return dist((a + b) / 2)
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

/**
 * Where a looked-up object is, from its samples (and a close pass's dense span, #215);
 * null where none cover the date.
 */
export function describeLookup(
  fine: SampledSpan,
  earthTrack: OrreryTrack | null,
  jd: number,
  closest: SampledSpan | null = null,
): LookupDescription | null {
  const s = lookupState({ fine, closest }, jd)
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

/** The nearest times to closest approach on the drawn pass, days (1 minute). */
const NEAREST_STEP_DAYS = 1 / 1440

/**
 * When to place the drawn pass of a looked-up object near Earth (#151), sorted: from where
 * it comes within `maxAu` of Earth to where it leaves, on the stretch of the span around
 * its closest approach. Spaced geometrically out from closest approach (a minute apart
 * there, days apart at the edges), as the Earth frame's scale is logarithmic in distance.
 * `earthAt` is Horizons' Earth, null where it has no samples; empty when the object never
 * comes that near while Earth is covered. The edges are kept: an object already near at
 * the span's start or still near at its end draws from or to there. A close pass's dense
 * span (`closest`, #215) places closest approach and the points around it.
 */
export function lookupNearTimes(
  fine: SampledSpan,
  earthAt: (jd: number) => Vec3 | null,
  maxAu: number,
  points: number,
  closest: SampledSpan | null = null,
): number[] {
  const dist = (jd: number): number => {
    const s = lookupState({ fine, closest }, jd)
    const e = s ? earthAt(jd) : null
    if (!s || !e) return Infinity
    const p = s.position
    return Math.hypot(p.x - e.x, p.y - e.y, p.z - e.z)
  }
  const n = Math.floor(fine.samples.length / 6)
  const at = (i: number) => fine.start + i * fine.step
  let best = -1
  let bestD = Infinity
  for (let i = 0; i < n; i += 1) {
    const d = dist(at(i))
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  if (best < 0 || !(bestD < maxAu)) return []
  // The closest approach, between the nearest sample's neighbours.
  const g = (Math.sqrt(5) - 1) / 2
  let lo = at(Math.max(0, best - 1))
  let hi = at(Math.min(n - 1, best + 1))
  for (let k = 0; k < REFINE_STEPS; k += 1) {
    const m1 = hi - g * (hi - lo)
    const m2 = lo + g * (hi - lo)
    if (dist(m1) < dist(m2)) hi = m2
    else lo = m1
  }
  const tMin = (lo + hi) / 2
  // The window's edges: the last sample inside on each side, then bisect to maxAu.
  const edge = (dir: 1 | -1): number => {
    let i = best
    while (i + dir >= 0 && i + dir < n && dist(at(i + dir)) < maxAu) i += dir
    if (i + dir < 0 || i + dir >= n) return at(i)
    let inside = at(i)
    let outside = at(i + dir)
    for (let k = 0; k < REFINE_STEPS; k += 1) {
      const mid = (inside + outside) / 2
      if (dist(mid) < maxAu) inside = mid
      else outside = mid
    }
    return inside
  }
  const start = Math.min(edge(-1), tMin)
  const end = Math.max(edge(1), tMin)
  const side = Math.max(1, Math.floor((points - 1) / 2))
  const spread = (reach: number): number[] => {
    if (reach <= 0) return []
    const first = Math.min(NEAREST_STEP_DAYS, reach)
    const out: number[] = []
    for (let j = 0; j < side; j += 1) {
      out.push(side === 1 ? reach : first * (reach / first) ** (j / (side - 1)))
    }
    return out
  }
  const before = spread(tMin - start).map((d) => tMin - d)
  const after = spread(end - tMin).map((d) => tMin + d)
  return [...before.reverse(), tMin, ...after]
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
