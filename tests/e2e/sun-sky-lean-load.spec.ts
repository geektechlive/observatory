/**
 * The Sun and Sky views draw no globe, so they must not start its feeds (#172). The
 * globe's data hooks (useGlobeData) ran for every view but the orrery, so a cold #sun
 * fetched the ISS TLE (plus the propagate chunk), launches, quakes and aurora for
 * nothing. The ticker's own feeds (eonet, fireball, ...) are shown on every view and
 * stay; so do Sky's Tonight panel's ISS TLE and aurora.
 */
import { expect, type Page, test } from '@playwright/test'

import { offlineSun } from './swpc'

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(60_000)

function recordRequests(page: Page): string[] {
  const urls: string[] = []
  page.on('request', (r) => {
    urls.push(new URL(r.url()).pathname)
  })
  return urls
}

async function coldLoad(page: Page, hash: string): Promise<string[]> {
  await offlineSun(page)
  const urls = recordRequests(page)
  await page.goto(`/${hash}`)
  await expect(page.locator('#console-panel')).toBeVisible()
  // Let the lazy Rest panels mount and any deferred import show itself.
  await page.waitForTimeout(2500)
  return urls
}

const chunk = (urls: string[], name: string) => urls.filter((u) => u.includes(`/${name}-`))

test('a cold load of #sun fetches none of the globe feeds', async ({ page }) => {
  const urls = await coldLoad(page, '#sun')
  for (const api of ['/api/iss-tle', '/api/launches', '/api/quakes', '/api/aurora']) {
    expect(urls, api).not.toContain(api)
  }
  expect(chunk(urls, 'propagate'), 'propagate chunk').toEqual([])
  // Nor the Earth textures index.html used to preload on desktop (#173).
  expect(urls.filter((u) => u.startsWith('/textures/'))).toEqual([])
  // The Sun's own feeds still load.
  expect(urls).toContain('/api/solar-wind')
})

test('a cold load of #sky fetches none of the globe-only feeds', async ({ page }) => {
  const urls = await coldLoad(page, '#sky')
  // Tonight's panel reads the ISS TLE for passes, so /api/iss-tle stays on Sky.
  for (const api of ['/api/launches', '/api/quakes']) {
    expect(urls, api).not.toContain(api)
  }
  expect(urls).toContain('/api/neo')
})

test('switching from #sun to Earth still loads the globe feeds', async ({ page }) => {
  const urls = await coldLoad(page, '#sun')
  await page.locator('#console-tab-earth').click()
  for (const api of ['/api/iss-tle', '/api/quakes', '/api/launches']) {
    await expect.poll(() => urls.includes(api), { timeout: 15_000 }).toBe(true)
  }
  await expect.poll(() => chunk(urls, 'propagate').length, { timeout: 15_000 }).toBeGreaterThan(0)
})
