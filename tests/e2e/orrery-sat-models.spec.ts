/**
 * A satellite with a model of its own opens in "Look closer" (#194): the ISS, from a mocked
 * /api/orrery-sats (satPayload.ts) and the real NASA model file. A satellite with no model of
 * its own gets a labelled stand-in (tier C): the CubeSat for Flock and Lemur, the generic bus for
 * other active satellites. Starlink, stations and debris get none.
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

/** Opens a satellite by its link, then Look closer, and waits for the model to load. */
async function lookCloser(page: Page, id: string, name: string) {
  await openOrrery(page, `#orrery?focus=sat:${id}`)
  await expect(page.getByRole('complementary').getByRole('heading', { name })).toBeVisible()
  await page.getByRole('button', { name: 'Look closer' }).click()
  const view = page.locator('[data-detail-view]')
  await expect(view).toHaveAttribute('data-detail-status', 'ready', { timeout: 20_000 })
  return view
}

test('a Planet Flock satellite shows the NASA CubeSat as a labelled stand-in', async ({ page }) => {
  const view = await lookCloser(page, '43037', 'FLOCK 4A-1')
  await expect(view).toContainText('not the exact shape of FLOCK 4A-1')
  await expect(view.locator('[data-detail-credit]')).toContainText('NASA/Christopher R. Meaney')
})

test('another active satellite shows the generic bus as a labelled stand-in', async ({ page }) => {
  const view = await lookCloser(page, '43000', 'OTHER-1')
  await expect(view).toContainText('not the exact shape of OTHER-1')
  await expect(view.locator('[data-detail-credit]')).toContainText('NASA/Ames Research Center')
})

test('a Starlink satellite has no Look closer button', async ({ page }) => {
  await openOrrery(page, '#orrery?focus=sat:44000')
  await expect(
    page.getByRole('complementary').getByRole('heading', { name: 'STARLINK-1' }),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Look closer' })).toHaveCount(0)
})
