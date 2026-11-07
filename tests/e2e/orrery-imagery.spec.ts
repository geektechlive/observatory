/**
 * Real imagery in the orrery (#105): planet maps load on first need and replace the flat
 * dot, the inspector labels each body's colour and credit, and the Sun shows GOES SUVI's
 * live frame, falling back to the flat disc when NOAA doesn't answer.
 */
import { expect, type Page, test } from '@playwright/test'

import { offlineSun } from './swpc'

test.use({ viewport: { width: 1440, height: 900 } })

const canvas = (page: Page) => page.locator('canvas[data-orrery-webgl]')
// A valid 1x1 PNG: enough for the Sun's crop to draw (the browser clips the source rect).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
)
const FRAME_PATH =
  '/images/animations/suvi/primary/171/or_suvi-l2-ci171_g19_s20261107T022000Z_e20261107T022400Z_v1-0-2.png'

async function openOrrery(page: Page) {
  await page.goto('/#orrery')
  await expect(page.locator('[data-orrery-mode]')).toHaveAttribute('data-orrery-mode', 'webgl', {
    timeout: 20_000,
  })
}

async function inspect(page: Page, name: string) {
  await page.getByRole('combobox', { name: /find/i }).fill(name.slice(0, 3).toLowerCase())
  await page.getByRole('option', { name, exact: true }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
}

test.describe('Orrery imagery (#105)', () => {
  test('the Sun shows the newest SUVI frame and when it was observed', async ({ page }) => {
    await page.route(
      'https://services.swpc.noaa.gov/products/animations/suvi-primary-171.json',
      (r) =>
        r.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ url: FRAME_PATH }]),
        }),
    )
    await page.route(`https://services.swpc.noaa.gov${FRAME_PATH}`, (r) =>
      r.fulfill({
        status: 200,
        contentType: 'image/png',
        headers: { 'access-control-allow-origin': '*' },
        body: PNG,
      }),
    )
    await openOrrery(page)
    await expect(canvas(page)).toHaveAttribute('data-orrery-sun', 'live')
    await inspect(page, 'Sun')
    await expect(
      page.getByText('Observed 2026-11-07 02:20–02:24 UTC by GOES-19 SUVI'),
    ).toBeVisible()
  })

  test('the Sun falls back to the flat disc, and says so, when NOAA fails', async ({ page }) => {
    await offlineSun(page)
    await openOrrery(page)
    await expect(canvas(page)).toHaveAttribute('data-orrery-sun', 'fallback')
    await inspect(page, 'Sun')
    await expect(page.getByText(/Flat disc: NOAA’s frame list did not load\./)).toBeVisible()
  })

  test('a planet’s map loads when it is focused and replaces its dot', async ({ page }) => {
    await offlineSun(page)
    const maps: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('/textures/planets/')) maps.push(new URL(req.url()).pathname)
    })
    await openOrrery(page)
    // The Inner view draws every planet as a dot or out of view: no map is fetched.
    await expect.poll(() => canvas(page).getAttribute('data-orrery-draws')).not.toBeNull()
    expect(maps).toEqual([])
    await inspect(page, 'Saturn')
    await expect
      .poll(async () => (await canvas(page).getAttribute('data-orrery-skins')) ?? '')
      .toContain('Saturn')
    expect(maps).toEqual(
      expect.arrayContaining([
        '/textures/planets/saturn.webp',
        '/textures/planets/saturn-rings.webp',
      ]),
    )
    await expect(page.getByText('True colour')).toBeVisible()
    await expect(page.getByText(/Björn Jónsson/).first()).toBeVisible()
  })
})
