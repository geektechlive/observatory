/**
 * Visible ISS passes over the user (#81). A pass is visible while the ISS is more
 * than 10° up, sunlit, and the observer's sky is dark enough (Sun below -6°, nautical
 * twilight): sunlight on the station against a dark sky is what makes it shine.
 * Checked against Heavens-Above to the minute (tests/unit/iss-passes.test.ts).
 */
import {
  degreesToRadians,
  ecfToLookAngles,
  eciToEcf,
  gstime,
  propagate,
  shadowFraction,
  sunPos,
  twoline2satrec,
} from 'satellite.js'

import { sunAltitude } from '@/lib/tonight'

export interface IssPass {
  start: Date
  peak: Date
  end: Date
  startElevation: number
  maxElevation: number
  /** Compass points where the visible part starts and ends. */
  from: string
  to: string
}

const STEP_MS = 10_000
const MIN_ELEVATION = 10
const DARK_ENOUGH = -6
/** In shadow once Earth hides at least half the Sun's disc (#97). */
const SHADOWED = 0.5
const RAD = Math.PI / 180
const COMPASS = [
  'N',
  'NNE',
  'NE',
  'ENE',
  'E',
  'ESE',
  'SE',
  'SSE',
  'S',
  'SSW',
  'SW',
  'WSW',
  'W',
  'WNW',
  'NW',
  'NNW',
]

const compass = (azDeg: number) =>
  COMPASS[Math.round((((azDeg % 360) + 360) % 360) / 22.5) % 16] ?? 'N'

/** Julian date, as satellite.js's `sunPos` takes it. */
const julianDay = (date: Date) => date.getTime() / 86_400_000 + 2440587.5

/**
 * In Earth's shadow, from satellite.js's shadow cone (umbra and penumbra) (#97). It
 * replaced our cylinder test, which it matched on all 25,920 ISS samples over 3 days
 * at a 0.5 threshold; the penumbra it adds is a few seconds per orbit.
 */
function inShadow(r: { x: number; y: number; z: number }, date: Date): boolean {
  return shadowFraction(sunPos(julianDay(date)).rsun, r) >= SHADOWED
}

/** A TLE's epoch: columns 19-32 of line 1 are a two-digit year and a fractional day. */
export function tleEpoch(line1: string): Date {
  const yy = Number(line1.slice(18, 20))
  const day = Number(line1.slice(20, 32))
  const year = yy < 57 ? 2000 + yy : 1900 + yy
  return new Date(Math.round(Date.UTC(year, 0, 1) + (day - 1) * 86_400_000))
}

interface Sample {
  time: Date
  elevation: number
  azimuth: number
  visible: boolean
}

/** Visible passes in the `hours` after `from`, in order. */
export function visiblePasses(
  tle: { line1: string; line2: string },
  lat: number,
  lon: number,
  from: Date,
  hours: number,
): IssPass[] {
  const satrec = twoline2satrec(tle.line1, tle.line2)
  const observer = {
    latitude: degreesToRadians(lat),
    longitude: degreesToRadians(lon),
    height: 0,
  }
  const sample = (time: Date): Sample | null => {
    const result = propagate(satrec, time)
    if (!result) return null
    const { position } = result
    const look = ecfToLookAngles(observer, eciToEcf(position, gstime(time)))
    const elevation = look.elevation / RAD
    const visible =
      elevation > MIN_ELEVATION &&
      sunAltitude(time, lat, lon) < DARK_ENOUGH &&
      !inShadow(position, time)
    return { time, elevation, azimuth: look.azimuth / RAD, visible }
  }

  const passes: IssPass[] = []
  let run: Sample[] = []
  const close = () => {
    const first = run[0]
    const last = run.at(-1)
    if (first && last) {
      const peak = run.reduce((best, s) => (s.elevation > best.elevation ? s : best), first)
      passes.push({
        start: first.time,
        peak: peak.time,
        end: last.time,
        startElevation: first.elevation,
        maxElevation: peak.elevation,
        from: compass(first.azimuth),
        to: compass(last.azimuth),
      })
    }
    run = []
  }
  const end = from.getTime() + hours * 3_600_000
  for (let t = from.getTime(); t <= end; t += STEP_MS) {
    const s = sample(new Date(t))
    if (s?.visible) run.push(s)
    else close()
  }
  close()
  return passes
}
