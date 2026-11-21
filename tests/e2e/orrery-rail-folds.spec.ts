/**
 * The control rail folds its layer groups (#273, direction A). Learn, Find and View stay
 * open; Solar system and Spacecraft start open and the rest folded; a visitor's folds are
 * remembered across a reload; and a layer switched on from outside the rail (here a link)
 * opens its group and says so. Before #273 the rail ran 2,680 px in a 720 px window.
 */
import { expect, type Page, test } from '@playwright/test'

import { serveMoons } from './moonPayload'
import { serveNeo } from './neoPayload'
import { COMET_ID, serveSmallBodies } from './smallBodiesPayload'
import { offlineSun } from './swpc'

test.use({ viewport: { width: 1440, height: 900 } })

async function open(page: Page, hash = '#orrery') {
  await offlineSun(page)
  await serveMoons(page)
  await serveNeo(page)
  await serveSmallBodies(page)
  await page.goto(`/${hash}`)
  await expect(page.locator('[data-orrery-mode]')).toHaveAttribute('data-orrery-mode', 'webgl', {
    timeout: 20_000,
  })
}

const rail = (page: Page) => page.getByRole('region', { name: 'Orrery controls' })
// A group's fold button sits in its heading; the Earth orbit preset shares the name.
const fold = (page: Page, name: string) =>
  rail(page)
    .locator('h2')
    .getByRole('button', { name: new RegExp(`^${name}`) })

test('the layer groups fold, say what is on, and the rail is far shorter', async ({ page }) => {
  await open(page)
  await expect(fold(page, 'Solar system')).toHaveAttribute('aria-expanded', 'true')
  await expect(fold(page, 'Spacecraft')).toHaveAttribute('aria-expanded', 'true')
  for (const name of ['Small bodies', 'Near Earth', 'Earth orbit']) {
    await expect(fold(page, name)).toHaveAttribute('aria-expanded', 'false')
  }
  await expect(fold(page, 'Solar system')).toContainText('3 of 3 on')
  await expect(fold(page, 'Small bodies')).toContainText('Off')
  await expect(fold(page, 'Earth orbit')).toContainText('5 of 7 on')
  await expect(rail(page).getByRole('switch', { name: 'Starlink' })).toHaveCount(0)
  const height = await rail(page).evaluate((el) => el.scrollHeight)
  expect(height).toBeLessThan(1340)
})

test('a visitor’s folds are remembered across a reload', async ({ page }) => {
  await open(page)
  await fold(page, 'Solar system').click()
  await fold(page, 'Earth orbit').click()
  await expect(rail(page).getByRole('switch', { name: 'Starlink' })).toBeVisible()
  await page.reload()
  await expect(page.locator('[data-orrery-mode]')).toHaveAttribute('data-orrery-mode', 'webgl', {
    timeout: 20_000,
  })
  await expect(fold(page, 'Solar system')).toHaveAttribute('aria-expanded', 'false')
  await expect(fold(page, 'Earth orbit')).toHaveAttribute('aria-expanded', 'true')
})

test('a link that switches comets on opens Small bodies and says why', async ({ page }) => {
  await open(page, `#orrery?focus=${COMET_ID}`)
  await expect(fold(page, 'Small bodies')).toHaveAttribute('aria-expanded', 'true')
  await expect(fold(page, 'Small bodies')).toContainText('1 of 4 on')
  await expect(
    rail(page).getByRole('status').filter({ hasText: 'Comets switched on' }),
  ).toBeVisible()
  const comets = rail(page).getByRole('switch', { name: 'Comets' })
  await expect(comets).toHaveAttribute('aria-checked', 'true')
  await expect(rail(page).locator('[data-just-on]')).toContainText('Comets')
  // Opening by itself is not the visitor's choice: a reload starts folded again.
  await page.goto('/#orrery')
  await expect(fold(page, 'Small bodies')).toHaveAttribute('aria-expanded', 'false')
})
