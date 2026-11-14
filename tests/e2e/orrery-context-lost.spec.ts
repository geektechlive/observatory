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

const loseContext = (page: Page) =>
  canvas(page).evaluate((c) => {
    const gl = (c as HTMLCanvasElement).getContext('webgl2')
    gl?.getExtension('WEBGL_lose_context')?.loseContext()
  })

test.describe('Orrery context loss: recovery (#238)', () => {
  test('a lost context says what happened and the 3D view restarts on a fresh canvas', async ({
    page,
  }) => {
    await open(page, '#orrery')
    await loseContext(page)
    const mode = page.locator('[data-orrery-mode]')
    await expect(mode).toHaveAttribute('data-orrery-mode', 'unavailable')
    const notice = page.getByRole('status').filter({ hasText: /lost its graphics/ })
    await expect(notice).toBeVisible()
    await expect(page.getByText(/could not start/)).toHaveCount(0)
    await page.getByRole('button', { name: 'Restart the 3D view' }).click()
    await expect(mode).toHaveAttribute('data-orrery-mode', 'webgl', { timeout: 20_000 })
    await expect(canvas(page)).toHaveCount(1)
    await expect(notice).toHaveCount(0)
  })

  test('after two restarts it stops offering one, so a failing GPU cannot loop', async ({
    page,
  }) => {
    await open(page, '#orrery')
    const mode = page.locator('[data-orrery-mode]')
    for (let i = 0; i < 2; i += 1) {
      await loseContext(page)
      await page.getByRole('button', { name: 'Restart the 3D view' }).click()
      await expect(mode).toHaveAttribute('data-orrery-mode', 'webgl', { timeout: 20_000 })
    }
    await loseContext(page)
    await expect(mode).toHaveAttribute('data-orrery-mode', 'unavailable')
    await expect(page.getByRole('button', { name: 'Restart the 3D view' })).toHaveCount(0)
    await expect(page.getByText(/Reload to try again/)).toBeVisible()
  })
})

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
