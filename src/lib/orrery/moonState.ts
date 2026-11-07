/**
 * The orrery's moons as drawable bodies (#107). The Horizons moons come planet-centred in
 * the payload's `moons`. Earth's Moon is in `bodies`, heliocentric beside Earth, both from
 * the same DE441 answer, so its geocentric vector is Moon minus Earth at one Julian date:
 * no extra request. Only fine spans are used, so a moon is never placed from coarse
 * whole-mission samples or extrapolated.
 */
import type { OrreryMoon, OrreryTrack, SampledSpan } from '@/schemas/orreryBodies'

import { type PlanetName, PLANETS } from './elements'
import { stateAt, type TrackState } from './ephemeris'

export interface MoonBody {
  /** The id search and the inspector use: `naif:501`. Earth's Moon keeps `naif:301`. */
  key: string
  name: string
  parent: PlanetName
  periodDays: number
  semiMajorAxisKm: number
  /** Where the vector comes from, for the inspector. */
  center: string
  target: string | null
  /** The fine spans the state comes from (one, or the Moon's and Earth's). */
  spans: readonly SampledSpan[]
  relative: (jd: number) => TrackState | null
}

/** Earth's Moon, from Horizons' physical data for 301 centred on 399 (read 2026-11-07). */
const MOON_PERIOD_DAYS = 27.321582
const MOON_SEMI_MAJOR_KM = 384_400
const PLANET_NAMES = new Set<string>(PLANETS)

const fineOnly = (span: SampledSpan) => ({ fine: span, coarse: null })

function earthsMoon(tracks: readonly OrreryTrack[]): MoonBody | null {
  const moon = tracks.find((t) => t.naifId === '301')
  const earth = tracks.find((t) => t.naifId === '399')
  const moonSpan = moon?.fine
  const earthSpan = earth?.fine
  if (!moon || !moonSpan || !earthSpan) return null
  return {
    key: moon.id,
    name: moon.name,
    parent: 'Earth',
    periodDays: MOON_PERIOD_DAYS,
    semiMajorAxisKm: MOON_SEMI_MAJOR_KM,
    center: 'Moon minus Earth, both heliocentric from JPL Horizons (DE441)',
    target: moon.target,
    spans: [moonSpan, earthSpan],
    relative: (jd) => {
      const m = stateAt(fineOnly(moonSpan), jd)
      const e = stateAt(fineOnly(earthSpan), jd)
      if (!m || !e) return null
      const sub = (a: TrackState['position'], b: TrackState['position']) => ({
        x: a.x - b.x,
        y: a.y - b.y,
        z: a.z - b.z,
      })
      return {
        position: sub(m.position, e.position),
        velocity: sub(m.velocity, e.velocity),
        resolution: 'fine',
      }
    },
  }
}

/** Every moon the orrery can draw: Earth's first, then the payload's, around drawn planets. */
export function moonBodies(
  moons: readonly OrreryMoon[],
  tracks: readonly OrreryTrack[],
): MoonBody[] {
  const out: MoonBody[] = []
  const moon = earthsMoon(tracks)
  if (moon) out.push(moon)
  for (const m of moons) {
    if (!PLANET_NAMES.has(m.parent.name)) continue
    out.push({
      key: m.id,
      name: m.name,
      parent: m.parent.name as PlanetName,
      periodDays: m.periodDays,
      semiMajorAxisKm: m.semiMajorAxisKm,
      center: `${m.parent.name}'s centre (Horizons ${m.center})`,
      target: m.target,
      spans: [m.fine],
      relative: (jd) => stateAt(fineOnly(m.fine), jd),
    })
  }
  return out
}

/** A moon's planet-centred state (au, au/day), or null outside its sampled window. */
export function moonRelative(body: MoonBody, jd: number): TrackState | null {
  return body.relative(jd)
}

const day = (jd: number) => new Date((jd - 2440587.5) * 86_400_000).toISOString().slice(0, 10)

/** The dates every span of a moon covers, YYYY-MM-DD, for "no data for this date". */
export function moonCoverage(body: MoonBody): string | null {
  if (body.spans.length === 0) return null
  const first = Math.max(...body.spans.map((s) => s.start))
  const last = Math.min(...body.spans.map((s) => s.start + (s.samples.length / 6 - 1) * s.step))
  return `${day(first)} to ${day(last)}`
}
