/**
 * Leaving the orrery tab and coming back (#189). The renderer outlives the page, so
 * what the page shows must catch up to it on return (the view is kept, like the clock).
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

const hash = (page: Page) => page.evaluate(() => window.location.hash)
const canvas = (page: Page) => page.locator('canvas[data-orrery-webgl]')

async function roundTrip(page: Page) {
  await page.getByRole('tab', { name: /EARTH/ }).click()
  await expect(page.getByRole('region', { name: 'Instrument' })).toBeVisible()
  await page.getByRole('tab', { name: /ORRERY/ }).click()
  await expect(page.locator('[data-orrery-mode]')).toHaveAttribute('data-orrery-mode', 'webgl', {
    timeout: 20_000,
  })
}

test.describe('Orrery tab round trip', () => {
  test('a focus survives it: the inspector, the chips and the address match the canvas (#189)', async ({
    page,
  }) => {
    await open(page, '#orrery?focus=Jupiter')
    await expect(canvas(page)).toHaveAttribute('data-orrery-focus', 'Jupiter')
    await expect(page.getByRole('complementary', { name: 'Jupiter' })).toBeVisible()
    await roundTrip(page)
    await expect(canvas(page)).toHaveAttribute('data-orrery-focus', 'Jupiter')
    await expect(page.getByRole('complementary', { name: 'Jupiter' })).toBeVisible()
    await expect(
      page.getByRole('group', { name: 'Focus' }).locator('button[aria-pressed="true"]'),
    ).toHaveCount(0)
    await expect.poll(() => hash(page)).toBe('#orrery?focus=Jupiter')
  })

  test('a preset survives it: the same chip is pressed and the address names it (#189)', async ({
    page,
  }) => {
    await open(page, '#orrery?preset=inner')
    const pressed = page
      .getByRole('group', { name: 'Focus' })
      .locator('button[aria-pressed="true"]')
    await expect(pressed).toHaveText('Inner')
    await roundTrip(page)
    await expect(pressed).toHaveText('Inner')
    await expect.poll(() => hash(page)).toBe('#orrery?preset=inner')
  })
})
