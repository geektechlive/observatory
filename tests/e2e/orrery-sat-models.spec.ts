/**
 * A satellite with a model of its own opens in "Look closer" (#194): the ISS, from a mocked
 * /api/orrery-sats (satPayload.ts) and the real NASA model file. The other satellites in the
 * mock have no model, so the button is absent for them.
 */
import { expect, type Page, test } from '@playwright/test'

import { serveMoons } from './moonPayload'
import { serveNeo } from './neoPayload'
import { serveSats } from './satPayload'
import { offlineSun } from './swpc'

test.beforeEach(async ({ page }) => {
  await offlineSun(page)
})

test.use({ viewport: { width: 1440, height: 900 } })

async function openOrrery(page: Page, hash = '#orrery') {
  await serveMoons(page)
  await serveNeo(page)
  await serveSats(page)
  await page.goto(`/${hash}`)
  await expect(page.locator('[data-orrery-mode]')).toHaveAttribute('data-orrery-mode', 'webgl', {
    timeout: 20_000,
  })
}

async function focus(page: Page, query: string, option: RegExp) {
  await page.getByRole('combobox', { name: /find/i }).fill(query)
  await page.getByRole('option', { name: option }).first().click()
}

test('the ISS has a Look closer view that loads its NASA model', async ({ page }) => {
  await openOrrery(page)
  await focus(page, 'ISS', /^ISS/)
  const inspector = page.getByRole('complementary')
  await expect(inspector.getByRole('heading', { name: 'ISS (ZARYA)' })).toBeVisible()
  await page.getByRole('button', { name: 'Look closer' }).click()
  const view = page.locator('[data-detail-view]')
  await expect(view).toHaveAttribute('data-detail-status', 'ready', { timeout: 20_000 })
  await expect(view.getByRole('status')).toHaveText('Model ready')
  await expect(view.locator('[data-detail-credit]')).toContainText('NASA/Michael D. Carbajal')
})

test('a satellite with no model has no Look closer button', async ({ page }) => {
  await openOrrery(page, '#orrery?focus=sat:43000')
  await expect(
    page.getByRole('complementary').getByRole('heading', { name: 'OTHER-1' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Look closer' })).toHaveCount(0)
})
