/**
 * A mocked /api/orrery-bodies with moons (#107): each moon circles its planet at its real
 * distance and period, sampled ±3 days around today, and Earth's Moon rides beside a
 * heliocentric Earth (the page draws it from Moon minus Earth).
 */
import type { Page } from '@playwright/test'

const DAY_MS = 86_400_000
const JD_UNIX = 2440587.5
const AU_KM = 149_597_870.7
const jdNow = () => Math.floor(Date.now() / DAY_MS) + JD_UNIX

/** Samples [x, y, z, vx, vy, vz] of a circle of radius km, period days, around the origin. */
function circle(km: number, periodDays: number, start: number, step: number, n: number) {
  const r = km / AU_KM
  const w = (2 * Math.PI) / periodDays
  const out: number[] = []
  for (let i = 0; i < n; i += 1) {
    const a = w * (start + i * step)
    out.push(r * Math.cos(a), r * Math.sin(a), 0, -r * w * Math.sin(a), r * w * Math.cos(a), 0)
  }
  return out
}

function moon(naifId: string, name: string, parent: [string, string], km: number, period: number) {
  const step = 1 / 24
  const start = jdNow() - 3
  return {
    id: `naif:${naifId}`,
    naifId,
    name,
    parent: { naifId: parent[0], name: parent[1] },
    center: `500@${parent[0]}`,
    target: `${name} (${naifId})`,
    periodDays: period,
    semiMajorAxisKm: km,
    fine: { start, step, samples: circle(km, period, start, step, 6 * 24 + 1) },
  }
}

/** Earth (or the Moon, offset) moving in a straight line near its real place. */
function heliocentric(naifId: string, name: string, category: string, offsetKm: number) {
  const start = jdNow() - 3
  const samples: number[] = []
  for (let i = 0; i <= 6 * 4; i += 1) {
    const t = i / 4 - 3
    samples.push(0.73 - 0.012 * t + offsetKm / AU_KM, 0.68 + 0.0127 * t, 0, -0.012, 0.0127, 0)
  }
  return {
    id: `naif:${naifId}`,
    naifId,
    name,
    mission: name,
    category,
    group: category === 'moon' ? 'moon' : 'planet',
    target: `${name} (${naifId})`,
    observedUntil: null,
    availableFrom: null,
    availableTo: null,
    fine: { start, step: 0.25, samples },
    coarse: null,
  }
}

export function moonPayload() {
  return {
    generatedAt: new Date().toISOString(),
    coarseFetchedAt: new Date().toISOString(),
    frame: 'ecliptic-J2000',
    center: 'Sun',
    timeScale: 'TDB',
    units: { position: 'au', velocity: 'au/day' },
    sourceType: 'ephemeris',
    provider: 'jpl-horizons',
    bodies: [
      heliocentric('399', 'Earth', 'planet', 0),
      heliocentric('301', 'Moon', 'moon', 384_400),
    ],
    moons: [
      moon('401', 'Phobos', ['499', 'Mars'], 9_377, 0.319),
      moon('402', 'Deimos', ['499', 'Mars'], 23_463, 1.263),
      moon('501', 'Io', ['599', 'Jupiter'], 422_000, 1.77),
      moon('502', 'Europa', ['599', 'Jupiter'], 671_000, 3.55),
      moon('503', 'Ganymede', ['599', 'Jupiter'], 1_070_000, 7.155),
      moon('504', 'Callisto', ['599', 'Jupiter'], 1_883_000, 16.691),
      moon('606', 'Titan', ['699', 'Saturn'], 1_221_870, 15.945),
    ],
    missing: [],
  }
}

/** Answer /api/orrery-bodies with the moon payload. */
export async function serveMoons(page: Page) {
  const body = JSON.stringify(moonPayload())
  await page.route('**/api/orrery-bodies', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'X-Data-Age': '3600' },
      body,
    }),
  )
}
