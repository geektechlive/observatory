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

/**
 * The chosen satellite with a model of its own is drawn as that model in the scene, in place of
 * its marker, at a fixed readable size that is not to scale (#194, ADR 0030): 20 px radius while the Sun is
 * off screen (the usual Earth-orbit view), 0.9 of the Sun's drawn radius while it is on. A satellite with
 * only a family stand-in stays a dot. `data-orrery-sat-model` says what is loaded;
 * `data-orrery-px` (set by the test) reports the drawn radii.
 */
const canvas = (page: Page) => page.locator('canvas[data-orrery-webgl]')
const satModel = (page: Page) => canvas(page).getAttribute('data-orrery-sat-model')
const px = async (page: Page) =>
  JSON.parse((await canvas(page).getAttribute('data-orrery-px')) ?? '{}') as Record<
    string,
    number | null
  >

async function chooseInScene(page: Page, id: string, name: string) {
  await openOrrery(page, `#orrery?focus=sat:${id}`)
  await canvas(page).evaluate((c) => {
    c.setAttribute('data-orrery-px', '')
  })
  await expect(page.getByRole('complementary').getByRole('heading', { name })).toBeVisible()
}

test('the chosen ISS is drawn as its own model, 20 px radius at most, while the Sun is off screen', async ({
  page,
}) => {
  await chooseInScene(page, '25544', 'ISS (ZARYA)')
  await expect.poll(() => satModel(page), { timeout: 20_000 }).toBe('model:sat:25544')
  await expect.poll(async () => (await px(page)).satModel ?? 0).toBeGreaterThan(10)
  const drawn = await px(page)
  expect(drawn.satSunVisible).toBe(false)
  // 20 px, held to a quarter of Earth's drawn radius. At the default view Earth is about 56 px
  // across its radius, so the guard bites there (14 px); it takes 80 px for the full 20.
  expect(drawn.satEarth ?? 0).toBeGreaterThan(40)
  expect(drawn.satModel ?? 0).toBeCloseTo(Math.min(20, (drawn.satEarth ?? 0) * 0.25), 1)
  expect(drawn.satSelect ?? 0).toBeCloseTo((drawn.satModel ?? 0) * 1.25, 1)
  expect(drawn.satModel ?? 0).toBeGreaterThan(drawn.satMarker ?? 0)
  // The inspector says it is a fixed size, not to scale.
  const inspector = page.getByRole('complementary')
  await expect(inspector).toContainText('Its own model once loaded, drawn at a fixed size')
  await expect(inspector).toContainText('not to scale')
})

test('the model reaches its full 20 px as the camera closes in and Earth grows', async ({
  page,
}) => {
  await chooseInScene(page, '25544', 'ISS (ZARYA)')
  await expect.poll(() => satModel(page), { timeout: 20_000 }).toBe('model:sat:25544')
  const box = await canvas(page).boundingBox()
  if (!box) throw new Error('no canvas')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, -200)
    await page.waitForTimeout(150)
  }
  await page.waitForTimeout(500)
  const drawn = await px(page)
  expect(drawn.satEarth ?? 0).toBeGreaterThanOrEqual(80)
  expect(drawn.satModel).toBe(20)
})

test('a satellite with only a family stand-in stays a dot in the scene', async ({ page }) => {
  await chooseInScene(page, '43000', 'OTHER-1')
  await page.waitForTimeout(500)
  expect(await satModel(page)).toBe('')
  // Look closer still has the stand-in, with its note; the inspector shows no Shape row.
  await expect(page.getByRole('button', { name: 'Look closer' })).toBeVisible()
  await expect(page.getByRole('complementary')).not.toContainText('Its own model')
})

test('a Starlink satellite stays a dot, and closing the inspector frees the model', async ({
  page,
}) => {
  await chooseInScene(page, '44000', 'STARLINK-1')
  await page.waitForTimeout(500)
  expect(await satModel(page)).toBe('')
  await page.goto('/#orrery?focus=sat:25544')
  await expect.poll(() => satModel(page), { timeout: 20_000 }).toBe('model:sat:25544')
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await expect.poll(() => satModel(page)).toBe('')
})
