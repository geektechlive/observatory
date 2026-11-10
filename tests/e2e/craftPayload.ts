/** A mocked /api/orrery-bodies with two spacecraft on straight lines, for size checks. */
import type { Page } from '@playwright/test'

const DAY_MS = 86_400_000
const JD_UNIX = 2440587.5
const jdNow = () => Math.floor(Date.now() / DAY_MS) + JD_UNIX

function track(
  naifId: string,
  name: string,
  group: 'deep-space' | 'mission',
  pos: [number, number, number],
  vel: [number, number, number],
) {
  const start = jdNow() - 30
  const fine: number[] = []
  for (let i = 0; i <= 60; i += 1) {
    const t = i - 30
    fine.push(pos[0] + vel[0] * t, pos[1] + vel[1] * t, pos[2] + vel[2] * t, ...vel)
  }
  const coarse: number[] = []
  const coarseStart = jdNow() - 3000
  for (let i = 0; i <= 50; i += 1) {
    const t = coarseStart + i * 100 - jdNow()
    coarse.push(pos[0] + vel[0] * t, pos[1] + vel[1] * t, pos[2] + vel[2] * t)
  }
  return {
    id: `naif:${naifId}`,
    naifId,
    name,
    mission: `${name} (test)`,
    category: 'spacecraft',
    group,
    target: `${name} (spacecraft) (${naifId})`,
    observedUntil: '1992-04-24',
    availableFrom: null,
    availableTo: null,
    fine: { start, step: 1, samples: fine },
    coarse: { start: coarseStart, step: 100, samples: coarse },
  }
}

export async function serveCraft(page: Page) {
  const now = new Date().toISOString()
  await page.route('**/api/orrery-bodies', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'X-Data-Age': '3600' },
      body: JSON.stringify({
        generatedAt: now,
        coarseFetchedAt: now,
        frame: 'ecliptic-J2000',
        center: 'Sun',
        timeScale: 'TDB',
        units: { position: 'au', velocity: 'au/day' },
        sourceType: 'ephemeris',
        provider: 'jpl-horizons',
        bodies: [
          track(
            '-31',
            'Voyager 1',
            'deep-space',
            [-32.2, -137.1, 99.2],
            [-0.0012, -0.00786, 0.00568],
          ),
          track('-96', 'Parker Solar Probe', 'mission', [0.2, 0.15, 0.01], [-0.01, 0.02, 0]),
        ],
        missing: [],
      }),
    }),
  )
}
