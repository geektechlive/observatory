/**
 * Opening #orrery directly must not do Earth-page work (#167). The store used to start
 * on 'earth' and read the hash in an effect, so the Earth columns mounted for one
 * render: their lazy chunks were fetched and their hooks called ten Earth feeds that
 * the orrery never shows. These tests count what a cold load asks for.
 */
import { expect, type Page, test } from '@playwright/test'

import { offlineSun } from './swpc'

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(90_000)

/** Feeds only the Earth page shows. The orrery keeps solar-wind, cme, dsn, spacetrack, discos. */
const EARTH_ONLY_API = [
  '/api/quakes',
  '/api/nws-alerts',
  '/api/eonet',
  '/api/donki',
  '/api/sentry',
  '/api/fireball',
  '/api/iss-tle',
  '/api/launches',
  '/api/aurora',
]
/** Chunks only the Earth page needs. */
const EARTH_ONLY_CHUNKS = ['EarthConsoleRest', 'land-110m', 'propagate']

function recordRequests(page: Page): string[] {
  const urls: string[] = []
  page.on('request', (r) => {
    const u = new URL(r.url())
    urls.push(u.pathname)
  })
  return urls
}

test('a cold load of #orrery fetches no Earth feeds or Earth-only chunks', async ({ page }) => {
  await offlineSun(page)
  const urls = recordRequests(page)
  await page.goto('/#orrery')
  await page.locator('[data-orrery-mode="webgl"]').waitFor({ timeout: 60_000 })
  // Let any delayed hook (an interval, a deferred import) show itself.
  await page.waitForTimeout(2500)

  for (const api of EARTH_ONLY_API) expect(urls, api).not.toContain(api)
  for (const chunk of EARTH_ONLY_CHUNKS) {
    expect(
      urls.filter((u) => u.includes(chunk)),
      chunk,
    ).toEqual([])
  }
  // What the orrery shows still loads.
  expect(urls).toContain('/api/orrery-bodies')
})

test('switching from the orrery to Earth still loads the Earth feeds', async ({ page }) => {
  await offlineSun(page)
  const urls = recordRequests(page)
  await page.goto('/#orrery')
  await page.locator('[data-orrery-mode="webgl"]').waitFor({ timeout: 60_000 })
  await page.locator('#console-tab-earth').click()
  await expect(page.locator('#console-panel')).toBeVisible()
  await expect.poll(() => urls.includes('/api/quakes'), { timeout: 15_000 }).toBe(true)
  for (const api of ['/api/eonet', '/api/launches', '/api/iss-tle']) {
    await expect.poll(() => urls.includes(api), { timeout: 15_000 }).toBe(true)
  }
  await expect
    .poll(() => urls.some((u) => u.includes('EarthConsoleRest')), { timeout: 15_000 })
    .toBe(true)
})

test('a cold load of #earth still fetches its feeds', async ({ page }) => {
  const urls = recordRequests(page)
  await page.goto('/#earth')
  for (const api of ['/api/quakes', '/api/eonet', '/api/launches', '/api/iss-tle']) {
    await expect.poll(() => urls.includes(api), { timeout: 15_000 }).toBe(true)
  }
})
