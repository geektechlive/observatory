/**
 * Changing the scale mode on an Earth view keeps the view (#187): the Earth–Moon and
 * Earth orbit presets set the focus to Earth too, and the scale change used to refocus
 * Earth instead of refitting the preset, dropping the framing the chip and link still name.
 */
import { expect, type Page, test } from '@playwright/test'

import { serveMoons } from './moonPayload'
import { serveNeo } from './neoPayload'
import { offlineSun } from './swpc'

test.beforeEach(async ({ page }) => {
  await offlineSun(page)
})

async function openOrrery(page: Page) {
  await serveMoons(page)
  await serveNeo(page)
  await page.goto('/#orrery')
  await expect(page.locator('[data-orrery-mode]')).toHaveAttribute('data-orrery-mode', 'webgl', {
    timeout: 20_000,
  })
}

const canvas = (page: Page) => page.locator('canvas[data-orrery-webgl]')

test.describe('scale mode on an Earth view (#187)', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  for (const [button, preset] of [
    ['Earth orbit', 'orbit'],
    ['Earth–Moon', 'earth'],
  ] as const) {
    test(`${button} stays ${preset} when the scale changes`, async ({ page }) => {
      await openOrrery(page)
      await page.getByRole('button', { name: button, exact: true }).click()
      await expect(canvas(page)).toHaveAttribute('data-orrery-focus', preset)
      await page.getByRole('radio', { name: 'Log distance' }).click()
      await expect(canvas(page)).toHaveAttribute('data-orrery-scale', 'log')
      await expect(canvas(page)).toHaveAttribute('data-orrery-focus', preset)
    })
  }
})
