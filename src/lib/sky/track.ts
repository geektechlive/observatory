/**
 * The maths under the sky view (#99 item 5), with no satellite.js in it: the dome
 * projection, the night around a moment, and a sampled object's track through it.
 *
 * `collectRuns` is the segmentation loop `lib/orbit/passes.ts` used to hold inline (a
 * pass is a run of consecutive samples that pass a test); the ISS passes and this view
 * share it, and `iss-passes.test.ts` is the regression gate. Orrery code must not import
 * `passes.ts`, which pulls in satellite.js; it may import this file.
 *
 * Positions come from Horizons samples only (topocentric.ts returns null outside the
 * spans): a gap is never drawn through, and nothing is extrapolated.
 */
import { compassPoint } from '@/lib/compass'
import { type Darkness, darkness, darkWindow, sunAltitude } from '@/lib/tonight'
import type { SampledSpan } from '@/schemas/orreryBodies'

import { MIN_ALTITUDE } from './cometsTonight'
import { type Observer, type Sampled, type SkyPosition, topocentric } from './topocentric'

const MINUTE_MS = 60_000
const HOUR_MS = 3_600_000
const DAY_MS = 86_400_000
const JD_UNIX_EPOCH = 2440587.5
const SAMPLE_STEP_MS = 10 * MINUTE_MS
/** The Sun's upper limb plus refraction: the night is the Sun below this. */
const SUNSET_ALTITUDE = -0.833
const BAND_STEP_MS = 5 * MINUTE_MS

export interface Window {
  start: Date
  end: Date
}

/**
 * Runs of consecutive samples that pass `keep`, every `stepMs` from `startMs` to `endMs`
 * (the end included). A `null` sample or one that fails `keep` closes the run.
 */
export function collectRuns<T>(
  startMs: number,
  endMs: number,
  stepMs: number,
  sample: (t: number) => T | null,
  keep: (s: T) => boolean,
): T[][] {
  const runs: T[][] = []
  let run: T[] = []
  const close = () => {
    if (run.length > 0) runs.push(run)
    run = []
  }
  for (let t = startMs; t <= endMs; t += stepMs) {
    const s = sample(t)
    if (s !== null && keep(s)) run.push(s)
    else close()
  }
  close()
  return runs
}

/**
 * A point on the dome, in [-1, 1] on both axes with screen y pointing down: zenith at the
 * centre, the horizon on the rim, north up and east on the LEFT, as when looking up at the
 * sky (owner's decision, 2026-11-12).
 */
export function domePoint(altitude: number, azimuth: number): { x: number; y: number } {
  const r = (90 - altitude) / 90
  const a = (azimuth * Math.PI) / 180
  return { x: -r * Math.sin(a), y: -r * Math.cos(a) }
}

/**
 * The night around a moment: the Sun below the horizon, from sunset to sunrise (to about
 * 5 minutes). If the moment is in the night it is that night, whole; in daylight, the
 * coming one. Null where the Sun doesn't set within a day.
 */
export function nightAround(ref: Date, lat: number, lon: number): Window | null {
  const dark = darkWindow(ref, lat, lon, SUNSET_ALTITUDE)
  if (!dark) return null
  let start = dark.start.getTime()
  const refMs = ref.getTime()
  // Already dark at the moment: darkWindow starts there, so walk back to the sunset.
  if (start === refMs) {
    const floor = refMs - DAY_MS
    while (
      start > floor &&
      sunAltitude(new Date(start - BAND_STEP_MS), lat, lon) <= SUNSET_ALTITUDE
    ) {
      start -= BAND_STEP_MS
    }
  }
  let end = dark.end.getTime()
  // A polar night has no sunset or sunrise: keep to a day around the moment.
  if (end - start > DAY_MS) {
    start = Math.max(start, refMs - DAY_MS / 2)
    end = Math.min(end, refMs + DAY_MS / 2)
  }
  return { start: new Date(start), end: new Date(end) }
}

export interface BandCell {
  from: Date
  to: Date
  darkness: Darkness
}

/** How dark the night is, in stretches, sampled every 5 minutes at their middles. */
export function twilightBand(night: Window, lat: number, lon: number): BandCell[] {
  const cells: BandCell[] = []
  const endMs = night.end.getTime()
  for (let t = night.start.getTime(); t < endMs; t += BAND_STEP_MS) {
    const to = Math.min(t + BAND_STEP_MS, endMs)
    const kind = darkness(sunAltitude(new Date((t + to) / 2), lat, lon))
    const last = cells.at(-1)
    if (last && last.darkness === kind) last.to = new Date(to)
    else cells.push({ from: new Date(t), to: new Date(to), darkness: kind })
  }
  return cells
}

const msOfJd = (jd: number) => (jd - JD_UNIX_EPOCH) * DAY_MS

/** First and last sample of a span (6 numbers a sample), or null for no span. */
export function spanWindow(span: SampledSpan | null): Window | null {
  if (!span || span.samples.length < 6) return null
  return {
    start: new Date(msOfJd(span.start)),
    end: new Date(msOfJd(span.start + (span.samples.length / 6 - 1) * span.step)),
  }
}

/**
 * The part of a window a fine span has samples for (never extrapolated), and whether that is
 * less than all of it. Null when the span is absent or misses the window.
 */
export function coveredWindow(
  span: SampledSpan | null,
  window: Window,
): { window: Window; partial: boolean } | null {
  const range = spanWindow(span)
  if (!range) return null
  const first = range.start.getTime()
  const last = range.end.getTime()
  const start = Math.max(window.start.getTime(), first)
  const end = Math.min(window.end.getTime(), last)
  if (end <= start) return null
  const partial = start > window.start.getTime() || end < window.end.getTime()
  return partial
    ? { window: { start: new Date(start), end: new Date(end) }, partial }
    : { window, partial }
}

/** One sample of the sky: when, how high, and which way. */
export interface SkyPoint {
  time: Date
  altitude: number
  azimuth: number
}

export interface SkyTrack {
  /** Stretches at or above the horizon, 10 minutes apart; below it, or without data, nothing. */
  segments: SkyPoint[][]
  /** The part of the night the samples cover; null if they cover none of it. */
  covered: { window: Window; partial: boolean } | null
}

/** Where it stands at a moment, or null outside the samples. */
export function skyAt(body: Sampled, observer: Observer, time: Date): SkyPoint | null {
  const sky = topocentric(body, time, observer)
  return sky && { time, altitude: sky.altitude, azimuth: sky.azimuth }
}

/**
 * The object's track through a window, every 10 minutes: only above the horizon, and only
 * where `topocentric` can place it. That is the one coverage rule the track, the hour rows
 * and the marker share: the fine span first, then the coarse one (ephemeris.ts `stateAt`),
 * never extrapolated. `covered` runs from the first to the last placed sample, and is
 * `partial` if any sample of the window had no position.
 */
export function skyTrack(body: Sampled, observer: Observer, window: Window): SkyTrack {
  const first = Math.ceil(window.start.getTime() / SAMPLE_STEP_MS) * SAMPLE_STEP_MS
  const placed: (SkyPoint | null)[] = []
  for (let t = first; t <= window.end.getTime(); t += SAMPLE_STEP_MS) {
    placed.push(skyAt(body, observer, new Date(t)))
  }
  const points = placed.filter((p): p is SkyPoint => p !== null)
  const start = points[0]
  const end = points.at(-1)
  if (!start || !end) return { segments: [], covered: null }
  const segments = collectRuns<SkyPoint>(
    first,
    window.end.getTime(),
    SAMPLE_STEP_MS,
    (t) => placed[(t - first) / SAMPLE_STEP_MS] ?? null,
    (p) => p.altitude >= 0,
  )
  return {
    segments,
    covered: {
      window: { start: start.time, end: end.time },
      partial: points.length < placed.length,
    },
  }
}

/** First and last sample over both of a body's spans, for saying what the data reaches. */
export function bodyRange(body: Sampled): Window | null {
  const spans = [spanWindow(body.fine), spanWindow(body.coarse)].filter(
    (w): w is Window => w !== null,
  )
  if (spans.length === 0) return null
  return {
    start: new Date(Math.min(...spans.map((w) => w.start.getTime()))),
    end: new Date(Math.max(...spans.map((w) => w.end.getTime()))),
  }
}

export interface HourRow {
  time: Date
  /** Null where the samples do not reach this hour. Negative: below the horizon. */
  altitude: number | null
  azimuth: number | null
  direction: string | null
  darkness: Darkness
}

/** The text equivalent of the dome: the sky at each local hour of the night. */
export function hourlyRows(body: Sampled, observer: Observer, night: Window): HourRow[] {
  const rows: HourRow[] = []
  const firstHour = new Date(night.start)
  firstHour.setMinutes(0, 0, 0)
  if (firstHour < night.start) firstHour.setTime(firstHour.getTime() + HOUR_MS)
  for (let t = firstHour.getTime(); t <= night.end.getTime(); t += HOUR_MS) {
    const time = new Date(t)
    const sky = topocentric(body, time, observer)
    rows.push({
      time,
      altitude: sky?.altitude ?? null,
      azimuth: sky?.azimuth ?? null,
      direction: sky ? compassPoint(sky.azimuth) : null,
      darkness: darkness(sunAltitude(time, observer.lat, observer.lon)),
    })
  }
  return rows
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

type Placed = SkyPosition & { time: Date }

/**
 * The stretch of the window it is above `MIN_ALTITUDE`, sampled every 10 minutes; if it
 * rises twice, the stretch with the highest peak. Null if it never gets there or has no
 * samples tonight.
 */
export function skyRun(body: Sampled, observer: Observer, window: Window): SkyRun | null {
  const runs = collectRuns<Placed>(
    window.start.getTime(),
    window.end.getTime(),
    SAMPLE_STEP_MS,
    (t) => {
      const sky = topocentric(body, new Date(t), observer)
      return sky && { ...sky, time: new Date(t) }
    },
    (s) => s.altitude >= MIN_ALTITUDE,
  )
  let best: SkyRun | null = null
  for (const run of runs) {
    const first = run[0]
    const last = run.at(-1)
    if (!first || !last) continue
    const peak = run.reduce((a, s) => (s.altitude > a.altitude ? s : a), first)
    if (best && peak.altitude <= best.altitude) continue
    best = {
      from: first.time,
      to: last.time,
      best: peak.time,
      altitude: peak.altitude,
      azimuth: peak.azimuth,
      direction: compassPoint(peak.azimuth),
      r: peak.r,
      delta: peak.delta,
      earthSun: peak.earthSun,
    }
  }
  return best
}
