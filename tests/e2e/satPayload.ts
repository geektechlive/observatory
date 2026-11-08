/**
 * A mocked /api/orrery-sats (#98): a few objects per group, with today's epoch so SGP4
 * places them all inside their ±3-day window. The elements are realistic (the ISS in low
 * orbit, GPS at 12 h, a geostationary ring) but invented, so the test never waits on
 * CelesTrak. `requested` lists the groups the page asked for.
 */
import type { Page } from '@playwright/test'

const FIELDS = [
  'name',
  'id',
  'cospar',
  'epoch',
  'meanMotion',
  'eccentricity',
  'inclination',
  'raan',
  'argPericenter',
  'meanAnomaly',
  'bstar',
  'meanMotionDot',
  'meanMotionDdot',
]

type Row = [string, string, string, string, ...number[]]

const epoch = () => new Date().toISOString().replace('Z', '')

/** n objects on one kind of orbit, spread round it. */
function ring(
  prefix: string,
  firstId: number,
  n: number,
  meanMotion: number,
  inclination: number,
  launchYear?: number,
): Row[] {
  return Array.from({ length: n }, (_, i) => [
    `${prefix}-${String(i + 1)}`,
    String(firstId + i),
    // A COSPAR id (year-number) for the lists that sort by launch (#158).
    launchYear === undefined ? '' : `${String(launchYear)}-${String(i + 1).padStart(3, '0')}A`,
    epoch(),
    meanMotion,
    0.0005,
    inclination,
    (i * 137) % 360,
    0,
    (i * 53) % 360,
    0.0001,
    0,
    0,
  ])
}

const GROUPS: Record<string, () => Row[]> = {
  stations: () => [
    ['ISS (ZARYA)', '25544', '1998-067A', epoch(), 15.5, 0.0004, 51.64, 120, 80, 10, 0.0002, 0, 0],
    ['CSS (TIANHE)', '48274', '2021-035A', epoch(), 15.6, 0.0006, 41.47, 200, 40, 90, 0.0002, 0, 0],
  ],
  'gps-ops': () => ring('GPS BIIF', 40000, 6, 2.0056, 55),
  weather: () => ring('GOES', 41000, 4, 1.0027, 0.05),
  science: () => ring('SCI', 42000, 3, 15.1, 28.5),
  other: () => ring('OTHER', 43000, 40, 14.2, 98, 2025),
  starlink: () => ring('STARLINK', 44000, 30, 15.06, 53, 2024),
}

export async function serveSats(page: Page): Promise<string[]> {
  const requested: string[] = []
  await page.route('**/api/orrery-sats?group=*', async (route) => {
    const group = new URL(route.request().url()).searchParams.get('group') ?? ''
    requested.push(group)
    const rows = (GROUPS[group] ?? (() => []))()
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'X-Data-Age': '3600' },
      body: JSON.stringify({
        group,
        label: group,
        category: 'x',
        source: 'celestrak',
        celestrakGroup: group,
        generatedAt: new Date().toISOString(),
        fields: FIELDS,
        count: rows.length,
        rows,
      }),
    })
  })
  return requested
}
