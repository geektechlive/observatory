/**
 * Visible ISS passes over the user (#81). A pass is visible while the ISS is more
 * than 10° up, sunlit, and the observer's sky is dark enough (Sun below -6°, nautical
 * twilight): sunlight on the station against a dark sky is what makes it shine.
 * Checked against Heavens-Above to the minute (tests/unit/iss-passes.test.ts).
 */
import * as satellite from 'satellite.js'

import { sunAltitude, sunEquatorial } from '@/lib/tonight'

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
const EARTH_RADIUS_KM = 6378.137
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

/**
 * In Earth's shadow: behind the Earth from the Sun, within a cylinder of Earth's
 * radius. The penumbra is ignored; the edge is a few seconds wide.
 */
function inShadow(r: { x: number; y: number; z: number }, date: Date): boolean {
  const { ra, dec } = sunEquatorial(date)
  const s = {
    x: Math.cos(dec * RAD) * Math.cos(ra * RAD),
    y: Math.cos(dec * RAD) * Math.sin(ra * RAD),
    z: Math.sin(dec * RAD),
  }
  const along = r.x * s.x + r.y * s.y + r.z * s.z
  if (along >= 0) return false
  const perp = Math.hypot(r.x - along * s.x, r.y - along * s.y, r.z - along * s.z)
  return perp < EARTH_RADIUS_KM
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
  const satrec = satellite.twoline2satrec(tle.line1, tle.line2)
  const observer = {
    latitude: satellite.degreesToRadians(lat),
    longitude: satellite.degreesToRadians(lon),
    height: 0,
  }
  const sample = (time: Date): Sample | null => {
    const { position } = satellite.propagate(satrec, time)
    if (typeof position === 'boolean') return null
    const look = satellite.ecfToLookAngles(
      observer,
      satellite.eciToEcf(position, satellite.gstime(time)),
    )
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
