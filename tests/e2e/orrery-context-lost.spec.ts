/**
 * A WebGL context lost after the orrery tab was left and reopened (#190): the renderer
 * outlives the page, so the notice must come from the live page, not the first one.
 */
import { expect, type Page, test } from '@playwright/test'

import { offlineSun } from './swpc'
import { voyager1 } from './voyagerPayload'

async function open(page: Page, hash: string) {
  await offlineSun(page)
  await page.route('**/api/orrery-bodies', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        generatedAt: new Date().toISOString(),
        coarseFetchedAt: new Date().toISOString(),
        frame: 'ecliptic-J2000',
        center: 'Sun',
        timeScale: 'TDB',
        units: { position: 'au', velocity: 'au/day' },
        sourceType: 'ephemeris',
        provider: 'jpl-horizons',
        bodies: [voyager1()],
        missing: [],
      }),
    }),
  )
  await page.goto(`/${hash}`)
  await expect(page.locator('[data-orrery-mode]')).toHaveAttribute('data-orrery-mode', 'webgl', {
    timeout: 20_000,
  })
}

const canvas = (page: Page) => page.locator('canvas[data-orrery-webgl]')

async function roundTrip(page: Page) {
  await page.getByRole('tab', { name: /EARTH/ }).click()
  await expect(page.getByRole('region', { name: 'Instrument' })).toBeVisible()
  await page.getByRole('tab', { name: /ORRERY/ }).click()
  await expect(page.locator('[data-orrery-mode]')).toHaveAttribute('data-orrery-mode', 'webgl', {
    timeout: 20_000,
  })
}

test.describe('Orrery context loss', () => {
  test('a context lost after a round trip shows the WebGL notice (#190)', async ({ page }) => {
    await open(page, '#orrery')
    await roundTrip(page)
    await canvas(page).evaluate((c) => {
      const gl = (c as HTMLCanvasElement).getContext('webgl2')
      gl?.getExtension('WEBGL_lose_context')?.loseContext()
    })
    await expect(page.locator('[data-orrery-mode]')).toHaveAttribute(
      'data-orrery-mode',
      'unavailable',
    )
  })
})
