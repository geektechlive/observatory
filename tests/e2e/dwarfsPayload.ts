import type { Page } from '@playwright/test'

/**
 * A mocked /api/orrery-dwarfs for e2e (#99 item 8): Pluto over the whole
 * clock and Ceres over 1600–2500, as the refresh job asks for them, on circles at their
 * semi-major axes with their periods. Close enough to look right; the real spans' accuracy
 * is tested in tests/unit/orrery-dwarf-view.test.ts against Horizons.
 */
const DAY_MS = 86_400_000
const jd = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY_MS + 2440587.5

export const PLUTO_ID = 'sbc:20134340'
export const CERES_ID = 'sbc:20000001'

function circle(from: string, to: string, step: number, aAu: number, periodDays: number) {
  const start = jd(from)
  const n = Math.floor((jd(to) - start) / step) + 1
  const samples: number[] = []
  for (let k = 0; k < n; k += 1) {
    const angle = (2 * Math.PI * k * step) / periodDays
    samples.push(
      Number((aAu * Math.cos(angle)).toFixed(6)),
      Number((aAu * Math.sin(angle)).toFixed(6)),
      0,
    )
  }
  return { start, step, samples }
}

export const dwarfs = () => [
  {
    id: 'sb:20134340',
    spkid: '20134340',
    name: 'Pluto',
    target: 'Pluto Barycenter (9)',
    availableFrom: null,
    availableTo: null,
    coarse: circle('-003005-01-01', '+003006-12-31', 1826, 39.59, 90_560),
  },
  {
    id: 'sb:20000001',
    spkid: '20000001',
    name: 'Ceres',
    target: '1 Ceres (A801 AA)',
    availableFrom: null,
    availableTo: null,
    coarse: circle('1600-01-01', '2500-12-31', 120, 2.77, 1680),
  },
]

/**
 * Serves /api/orrery-dwarfs; returns the request paths seen, so a test can tell it was
 * asked for. `empty` serves a copy with no dwarf planets yet.
 */
export async function serveDwarfs(page: Page, opts: { empty?: boolean } = {}): Promise<string[]> {
  const asked: string[] = []
  await page.route('**/api/orrery-dwarfs', (route) => {
    asked.push(new URL(route.request().url()).pathname)
    return route.fulfill({
      json: {
        generatedAt: new Date().toISOString(),
        coarseFetchedAt: new Date().toISOString(),
        frame: 'ecliptic-J2000',
        center: 'Sun',
        timeScale: 'TDB',
        units: { position: 'au' },
        sourceType: 'ephemeris',
        provider: 'jpl-horizons',
        dwarfs: opts.empty ? [] : dwarfs(),
        missing: [],
      },
    })
  })
  return asked
}
