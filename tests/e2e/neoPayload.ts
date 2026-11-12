/**
 * A mocked /api/orrery-neo (#92): four close approaches moving in straight lines near
 * moonPayload.ts's Earth (the same line, sampled ±3 days around today at 3 h), so the
 * Earth frame can place them. One is hazardous with its closest approach within a day,
 * one is on ESA's risk list two and a half days out, one passed two days ago, and one
 * comes twelve days out (#136).
 */
import type { Page } from '@playwright/test'

const DAY_MS = 86_400_000
const JD_UNIX = 2440587.5
const jdNow = () => Math.floor(Date.now() / DAY_MS) + JD_UNIX

/** moonPayload.ts's Earth at t days from today 00:00 UTC. */
const earthAt = (t: number) => [0.73 - 0.012 * t, 0.68 + 0.0127 * t, 0]

function approach(
  des: string,
  offset: [number, number, number],
  drift: [number, number, number],
  caDays: number,
  flags: { pha: boolean; riskListed: boolean },
) {
  const start = jdNow() - 3
  const samples: number[] = []
  for (let i = 0; i <= 48; i += 1) {
    const t = i / 8 - 3
    const e = earthAt(t)
    samples.push(
      (e[0] ?? 0) + offset[0] + drift[0] * t,
      (e[1] ?? 0) + offset[1] + drift[1] * t,
      offset[2] + drift[2] * t,
      -0.012 + drift[0],
      0.0127 + drift[1],
      drift[2],
    )
  }
  const jd = jdNow() + caDays
  return {
    id: `sb:${des}`,
    des,
    name: `(${des})`,
    orbitId: '7',
    pha: flags.pha,
    riskListed: flags.riskListed,
    h: 24.5,
    diameterKm: null,
    closeApproach: {
      jd,
      date: new Date((jd - JD_UNIX) * DAY_MS).toISOString(),
      distAu: 0.004,
      distMinAu: 0.0039,
      distMaxAu: 0.0041,
      vRelKms: 9.1,
      vInfKms: 9,
      tSigma: '< 00:01',
    },
    target: `(${des})`,
    fine: { start, step: 0.125, samples },
  }
}

export function neoPayload() {
  return {
    generatedAt: new Date().toISOString(),
    frame: 'ecliptic-J2000',
    center: 'Sun',
    timeScale: 'TDB',
    units: { position: 'au', velocity: 'au/day' },
    sourceType: 'ephemeris',
    provider: 'jpl-horizons',
    window: { from: '2026-01-01', to: '2026-01-21' },
    approaches: [
      approach('2026 TA1', [0.004, 0.001, 0.0005], [0.0004, -0.0002, 0], 0.5, {
        pha: true,
        riskListed: false,
      }),
      approach('2026 TB2', [-0.003, 0.004, -0.001], [0.0002, 0.0003, 0], 2.5, {
        pha: false,
        riskListed: true,
      }),
      approach('2026 TC3', [0.002, -0.005, 0.001], [-0.0003, 0.0001, 0], -2, {
        pha: false,
        riskListed: false,
      }),
      // Twelve days out: only "Within 30 days" keeps it (#136).
      approach('2026 TD4', [-0.004, -0.002, 0.0008], [0.0001, 0.0002, 0], 12, {
        pha: false,
        riskListed: false,
      }),
    ],
    scout: { objects: [] },
    esa: { riskList: null, closeApproaches: null },
    missing: [],
  }
}

/** A mocked approach, for a spec that needs one of its own geometry (#133). */
export const mockApproach = approach

/** Answer /api/orrery-neo with the mocked approaches, plus any `extra` ones. */
export async function serveNeo(page: Page, extra: readonly ReturnType<typeof approach>[] = []) {
  const payload = neoPayload()
  const body = JSON.stringify({ ...payload, approaches: [...payload.approaches, ...extra] })
  await page.route('**/api/orrery-neo', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'X-Data-Age': '3600' },
      body,
    }),
  )
}
