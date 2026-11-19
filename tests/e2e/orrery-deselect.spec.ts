/**
 * Deselecting (#265): a click on empty space or Esc does what the inspector's Close does; a
 * drag does not. The stage's Guide button shows on desktop too (#266).
 */
import { expect, type Page, test } from '@playwright/test'

import { moonPayload } from './moonPayload'
import { offlineSun } from './swpc'

test.use({ viewport: { width: 1440, height: 900 } })

async function openOn(page: Page, focus: string) {
  await offlineSun(page)
  await page.route('**/api/orrery-bodies', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'X-Data-Age': '3600' },
      body: JSON.stringify(moonPayload()),
    }),
  )
  await page.goto(`/orrery/#focus=${focus}`)
  await expect(page.locator('[data-orrery-mode]')).toHaveAttribute('data-orrery-mode', 'webgl', {
    timeout: 20_000,
  })
  await expect(inspectorTitle(page, focus)).toBeVisible()
}

const inspectorTitle = (page: Page, name: string) =>
  page.getByRole('heading', { name, exact: true })

/** A point on the canvas, away from any body: half way down the stage's left edge. */
async function emptySpot(page: Page) {
  const box = await page.locator('canvas[data-orrery-webgl]').boundingBox()
  if (!box) throw new Error('no canvas')
  const spot = { x: box.x + 40, y: box.y + box.height / 2 }
  const tag = await page.evaluate((p) => document.elementFromPoint(p.x, p.y)?.tagName, spot)
  expect(tag).toBe('CANVAS')
  return spot
}

test.describe('Deselecting (#265)', () => {
  test('a click on empty space deselects; the address drops the focus', async ({ page }) => {
    await openOn(page, 'Mars')
    const { x, y } = await emptySpot(page)
    await page.mouse.click(x, y)
    await expect(inspectorTitle(page, 'Mars')).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => window.location.hash)).not.toContain('focus=')
  })

  test('a drag on empty space turns the camera and keeps the selection', async ({ page }) => {
    await openOn(page, 'Mars')
    const { x, y } = await emptySpot(page)
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 60, y + 10, { steps: 6 })
    await page.mouse.up()
    await page.waitForTimeout(300)
    await expect(inspectorTitle(page, 'Mars')).toBeVisible()
  })

  test('Esc deselects; with the guide open it only closes the guide', async ({ page }) => {
    await openOn(page, 'Mars')
    await stageGuide(page).click()
    await expect(page.getByRole('complementary', { name: 'Guide', exact: true })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('complementary', { name: 'Guide', exact: true })).toHaveCount(0)
    await expect(inspectorTitle(page, 'Mars')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(inspectorTitle(page, 'Mars')).toHaveCount(0)
  })
})

const stageGuide = (page: Page) =>
  page.locator('section[aria-label="Orrery"]').getByRole('button', { name: 'Guide', exact: true })

test('the stage shows its Guide button on desktop too (#266)', async ({ page }) => {
  await openOn(page, 'Mars')
  await expect(stageGuide(page)).toBeVisible()
  // Inside the stage, top left, clear of the canvas's edge markers.
  const stage = await page.locator('section[aria-label="Orrery"]').boundingBox()
  const btn = await stageGuide(page).boundingBox()
  expect(stage && btn).toBeTruthy()
  if (!stage || !btn) return
  expect(btn.x - stage.x).toBeLessThan(80)
  expect(btn.y - stage.y).toBeLessThan(60)
})
