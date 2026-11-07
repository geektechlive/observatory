/**
 * Earth's neighbourhood in the orrery (#92). /api/orrery-bodies (Earth and the Moon) and
 * /api/orrery-neo (three close approaches near that Earth) are mocked: the Earth–Moon
 * preset opens the Earth frame with L1 and the approaches in it, the filters change
 * what is drawn, and a hazardous approach opens in the inspector with its pass drawn.
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
const attr = async (page: Page, name: string) => (await canvas(page).getAttribute(name)) ?? ''

test.describe('Earth’s neighbourhood (#92)', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('the Earth–Moon preset opens the Earth frame, with L1 and the approaches', async ({
    page,
  }) => {
    await openOrrery(page)
    // Heliosphere: the frame is closed.
    await expect.poll(() => attr(page, 'data-orrery-earth-frame')).toBe('0.00')
    await page.getByRole('button', { name: 'Earth–Moon', exact: true }).click()
    await expect(canvas(page)).toHaveAttribute('data-orrery-focus', 'earth')
    await expect.poll(() => attr(page, 'data-orrery-earth-frame')).toBe('1.00')
    await expect(canvas(page)).toHaveAttribute('data-orrery-l1', 'true')
    await expect.poll(() => attr(page, 'data-orrery-asteroids')).toBe('4')
    // The L1 & L2 craft come on with it.
    await expect(page.getByRole('switch', { name: /L1 & L2/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    // The approaches are labelled, in their colours.
    const labels = page.locator('[data-orrery-page] button[data-kind="asteroid"]:visible')
    await expect.poll(() => labels.count()).toBeGreaterThan(0)
  })

  test('the filters change which approaches are drawn', async ({ page }) => {
    await openOrrery(page)
    await page.getByRole('button', { name: 'Earth–Moon', exact: true }).click()
    // Within 30 days, the default (#136): all four.
    await expect.poll(() => attr(page, 'data-orrery-asteroids')).toBe('4')
    const window = page.getByRole('radiogroup', { name: /closest approach/i })
    await window.getByRole('radio', { name: /within a day/i }).click()
    await expect.poll(() => attr(page, 'data-orrery-asteroids')).toBe('1')
    await window.getByRole('radio', { name: /within a week/i }).click()
    await expect.poll(() => attr(page, 'data-orrery-asteroids')).toBe('3')
    await page.getByRole('switch', { name: /risk list only/i }).click()
    await expect.poll(() => attr(page, 'data-orrery-asteroids')).toBe('1')
    await page.getByRole('switch', { name: /risk list only/i }).click()
    await page.getByRole('switch', { name: /hazardous only/i }).click()
    await expect.poll(() => attr(page, 'data-orrery-asteroids')).toBe('1')
    await expect(page.getByText(/1 of 4 drawn/)).toBeVisible()
    await page.getByRole('switch', { name: /hazardous only/i }).click()
    await window.getByRole('radio', { name: /within 30 days/i }).click()
    await expect.poll(() => attr(page, 'data-orrery-asteroids')).toBe('4')
  })

  test('a hazardous approach opens in the inspector, its pass drawn, the terms kept apart', async ({
    page,
  }) => {
    await openOrrery(page)
    await page.getByRole('combobox', { name: /find/i }).fill('2026 TA1')
    await page.getByRole('option', { name: /^2026 TA1/ }).click()
    const inspector = page.getByRole('complementary')
    await expect(inspector.getByRole('heading', { name: '2026 TA1' })).toBeVisible()
    await expect(
      inspector.getByText('Potentially hazardous asteroid', { exact: false }),
    ).toBeVisible()
    const terms = inspector.getByRole('list', { name: /impact terms/i }).getByRole('listitem')
    await expect(terms).toHaveCount(4)
    await expect(terms.nth(3)).toContainText('Confirmed impact: No')
    await expect(canvas(page)).toHaveAttribute('data-orrery-focus', 'sb:2026 TA1')
    await expect
      .poll(async () => Number(await attr(page, 'data-orrery-asteroid-path')))
      .toBeGreaterThan(40)
    // Focused, it sits in the open frame.
    await expect.poll(() => attr(page, 'data-orrery-earth-frame')).toBe('1.00')
  })
})
