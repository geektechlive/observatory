/**
 * A panel keeps its last good answer when a refetch fails (#222, stale-while-revalidate
 * #83). The first /api/co2 answer is good but marked `X-Cache: REVALIDATING`, so the app
 * asks again 10 s later (main.tsx); every later answer is a 503 without `X-Cache: NEG`, so
 * the three quick retries (1, 2, 4 s) run out and the query ends in an error. The panel
 * must still show its reading, add a quiet "couldn't refresh" mark, and keep its height.
 */
import { expect, test } from '@playwright/test'

import { CO2 } from './feedFixtures'

test('a panel whose refetch fails keeps its data and marks it stale (#222)', async ({ page }) => {
  test.setTimeout(90_000)
  let co2Calls = 0
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname
    if (path === '/api/co2') {
      co2Calls += 1
      if (co2Calls === 1) {
        await route.fulfill({ json: CO2, headers: { 'X-Cache': 'REVALIDATING' } })
        return
      }
    }
    await route.fulfill({ status: 503, json: { error: 'mock' } })
  })
  await page.goto('/')

  const panel = page
    .locator('div', { has: page.getByRole('heading', { name: 'Atmospheric CO₂' }) })
    .last()
  await panel.scrollIntoViewIfNeeded()
  await expect(panel.getByText('428.3')).toBeVisible()
  const before = await panel.boundingBox()

  const mark = panel.getByText(/couldn't refresh/)
  await expect(mark).toBeVisible({ timeout: 60_000 })
  await expect(panel.getByText('428.3')).toBeVisible()
  await expect(panel.getByText('Data unavailable')).toHaveCount(0)
  expect(co2Calls).toBeGreaterThanOrEqual(4)

  const after = await panel.boundingBox()
  expect(after?.height).toBe(before?.height)

  if (process.env['STALE_SHOT']) await panel.screenshot({ path: process.env['STALE_SHOT'] })
})
