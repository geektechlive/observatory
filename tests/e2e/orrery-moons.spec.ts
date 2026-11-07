/**
 * Moons in the orrery (#107). /api/orrery-bodies is mocked (moonPayload.ts): each moon
 * circles its planet at its real distance and period, and Earth's Moon rides beside a
 * heliocentric Earth. Moons show near their planet and are hidden zoomed out.
 */
import { expect, type Page, test } from '@playwright/test'

import { serveMoons } from './moonPayload'
import { offlineSun } from './swpc'

test.beforeEach(async ({ page }) => {
  await offlineSun(page)
})

async function openOrrery(page: Page) {
  await serveMoons(page)
  await page.goto('/#orrery')
  await expect(page.locator('[data-orrery-mode]')).toHaveAttribute('data-orrery-mode', 'webgl', {
    timeout: 20_000,
  })
}

const canvas = (page: Page) => page.locator('canvas[data-orrery-webgl]')
const drawnMoons = async (page: Page) =>
  ((await canvas(page).getAttribute('data-orrery-moons')) ?? '').split(',').filter(Boolean).sort()

async function find(page: Page, name: string) {
  await page.getByRole('combobox', { name: /find/i }).fill(name)
  await page
    .getByRole('option', { name: new RegExp(`^${name}`) })
    .first()
    .click()
}

test.describe('Moons in the orrery (#107)', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('no moons zoomed out: they would all sit on their planets’ dots', async ({ page }) => {
    await openOrrery(page)
    await page.getByRole('button', { name: 'Outer', exact: true }).click()
    await expect.poll(() => drawnMoons(page)).toEqual([])
  })

  test('focusing Jupiter shows the four Galilean moons, labelled', async ({ page }) => {
    await openOrrery(page)
    await find(page, 'Jupiter')
    await expect.poll(() => drawnMoons(page)).toEqual(['Callisto', 'Europa', 'Ganymede', 'Io'])
    const labels = page.locator('[data-orrery-page] button[data-kind="moon"]:visible')
    await expect.poll(() => labels.count()).toBeGreaterThanOrEqual(3)
  })

  test('their orbits are drawn like the planets’, under the Orbits switch', async ({ page }) => {
    await openOrrery(page)
    await find(page, 'Jupiter')
    await expect(canvas(page)).toHaveAttribute('data-orrery-moon-orbits', '4')
    await page.getByRole('switch', { name: 'Orbits' }).click()
    await expect(canvas(page)).toHaveAttribute('data-orrery-moon-orbits', '0')
    await page.getByRole('switch', { name: 'Orbits' }).click()
    await expect(canvas(page)).toHaveAttribute('data-orrery-moon-orbits', '4')
    // Zoomed out, no moons and no moon orbits.
    await page.getByRole('button', { name: 'Outer', exact: true }).click()
    await expect(canvas(page)).toHaveAttribute('data-orrery-moon-orbits', '0')
  })

  test('focusing Mars shows Phobos and Deimos', async ({ page }) => {
    await openOrrery(page)
    await find(page, 'Mars')
    await expect.poll(() => drawnMoons(page)).toEqual(['Deimos', 'Phobos'])
  })

  test('Earth’s Moon is drawn around Earth', async ({ page }) => {
    await openOrrery(page)
    await find(page, 'Earth')
    await expect.poll(() => drawnMoons(page)).toEqual(['Moon'])
  })

  test('a moon from search opens its inspector and frames its planet', async ({ page }) => {
    await openOrrery(page)
    await find(page, 'Io')
    const inspector = page.getByRole('complementary')
    await expect(inspector.getByRole('heading', { name: 'Io' })).toBeVisible()
    await expect(inspector).toContainText('Jupiter')
    await expect(inspector).toContainText(/not to scale/i)
    await expect(canvas(page)).toHaveAttribute('data-orrery-focus', 'Jupiter')
    await expect.poll(() => drawnMoons(page)).toContain('Io')
  })
})
