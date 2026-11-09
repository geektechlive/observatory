/**
 * A cold desktop load must not jump (#169). Cloudflare Web Analytics reported a desktop
 * CLS p75 of 0.244. Measured on a cold 1440x900 and 1920x1080 load, the shifts were the
 * console column growing as its feeds arrived (the voice line from one line to two, each
 * lead panel from its "Loading" box to its data), the ISS plate widening with its first
 * position, and the globe's lens growing after first paint. Fonts were not a source: the
 * layout does not reflow when they swap. This test replays the load with delayed feeds
 * and sums the layout-shift entries the way the CLS metric does (ignoring shifts that
 * follow input).
 */
import { expect, type Page, test } from '@playwright/test'

import { AFTERSHOCKS, CO2, ISS_TLE, NWS_ALERTS, SOLAR_WIND } from './feedFixtures'

const FALLBACK_DELAY_MS = 500
/**
 * Google's "good" is 0.1. This replay is milder than a real load (its feeds come from
 * a mock), so 0.1 would have passed the code that shipped: that scored 0.044 at 1440 px
 * and 0.019 at 1920 px here, and about 0.07 to 0.09 against production. With the fixes
 * it scores 0.0002 and 0.0028, so the budget sits an order of magnitude under "good".
 */
const CLS_BUDGET = 0.01

/**
 * Just after the newest timestamp in feedFixtures. The page's clock is frozen here (#184):
 * panels drop data by age, so against the real clock these fixtures expire a day later.
 */
const NOW = Date.UTC(2026, 10, 8, 15, 40, 0)

/** Four quakes over M5, so the voice line is its usual two lines. */
const QUAKES = {
  updatedAt: new Date(NOW).toISOString(),
  quakes: [
    ['central Mid-Atlantic Ridge', 5.8],
    ['10 km NW of Hamakata, Japan', 5.5],
    ['91 km ENE of Hihifo, Tonga', 5.1],
    ['41 km WSW of Gadung, Philippines', 5.2],
  ].map(([place, mag], i) => ({
    id: `q${String(i)}`,
    mag: mag as number,
    place: place as string,
    lat: -10 + i * 20,
    lon: 140 + i * 5,
    depthKm: 10,
    time: NOW - i * 3_600_000,
    tsunami: false,
    url: 'https://earthquake.usgs.gov/',
  })),
}

async function watchShifts(page: Page) {
  await page.addInitScript(() => {
    const shifts: { value: number; hadRecentInput: boolean }[] = []
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        const entry = e as PerformanceEntry & { value: number; hadRecentInput: boolean }
        shifts.push({ value: entry.value, hadRecentInput: entry.hadRecentInput })
      }
    }).observe({ type: 'layout-shift', buffered: true })
    ;(window as unknown as { layoutShifts: typeof shifts }).layoutShifts = shifts
  })
}

/**
 * Each feed's data and how long it takes. The delays are spread because real feeds
 * arrive one by one, and a shift counts every time the layout moves, not once per load.
 */
const FEEDS: Record<string, { body: unknown; delayMs: number }> = {
  '/api/iss-tle': { body: ISS_TLE, delayMs: 300 },
  '/api/quakes': { body: QUAKES, delayMs: 450 },
  '/api/solar-wind': { body: SOLAR_WIND, delayMs: 700 },
  '/api/aftershocks': { body: AFTERSHOCKS, delayMs: 900 },
  '/api/nws-alerts': { body: NWS_ALERTS, delayMs: 1100 },
  '/api/co2': { body: CO2, delayMs: 1300 },
}

/** Answer each feed after its delay; every other feed as unavailable. */
async function delayFeeds(page: Page) {
  await page.route('**/api/**', async (route) => {
    const feed = FEEDS[new URL(route.request().url()).pathname]
    await new Promise((resolve) => setTimeout(resolve, feed?.delayMs ?? FALLBACK_DELAY_MS))
    if (feed) {
      await route.fulfill({ json: feed.body })
      return
    }
    await route.fulfill({ status: 503, json: { error: 'mock' } })
  })
}

async function cumulativeShift(page: Page): Promise<number> {
  return page.evaluate(() =>
    (
      window as unknown as { layoutShifts: { value: number; hadRecentInput: boolean }[] }
    ).layoutShifts
      .filter((s) => !s.hadRecentInput)
      .reduce((sum, s) => sum + s.value, 0),
  )
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
]) {
  test(`a cold ${String(viewport.width)}px load of / stays under ${String(CLS_BUDGET)} CLS`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.clock.setFixedTime(new Date(NOW))
    await watchShifts(page)
    await delayFeeds(page)
    await page.goto('/')
    await expect(page.getByText('central Mid-Atlantic Ridge')).toBeVisible()
    // Let the globe, the ISS readout and every late panel settle.
    await page.waitForTimeout(3000)
    const cls = await cumulativeShift(page)
    expect(cls, `cumulative layout shift ${cls.toFixed(4)}`).toBeLessThan(CLS_BUDGET)
  })
}
