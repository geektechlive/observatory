/**
 * Panning with an object focused (#259). The renderer kept the camera on the focus every
 * frame, so a pan was undone on the next frame, and closing the inspector didn't stop it.
 * A pan now lets go of the focus: the view stays where the pan left it.
 */
import { expect, type Page, test } from '@playwright/test'

import { offlineSun } from './swpc'

test.beforeEach(async ({ page }) => {
  await offlineSun(page)
})

test.use({ viewport: { width: 1440, height: 900 } })

const canvas = (page: Page) => page.locator('canvas[data-orrery-webgl]')

/** Where the focus is drawn, canvas px. */
async function focusX(page: Page): Promise<number> {
  const px = (await canvas(page).getAttribute('data-orrery-focus-px')) ?? 'none'
  return px === 'none' ? Number.NaN : Number(px.split(',')[0])
}

async function settle(page: Page) {
  await expect(canvas(page)).toHaveAttribute('data-orrery-animating', 'false', {
    timeout: 15_000,
  })
}

/** A right-drag across the stage's middle: OrbitControls' pan. */
async function pan(page: Page, dx: number) {
  const box = await canvas(page).boundingBox()
  if (!box) throw new Error('no canvas')
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down({ button: 'right' })
  await page.mouse.move(x + dx, y, { steps: 10 })
  await page.mouse.up({ button: 'right' })
}

test('a pan moves the view off a focused planet, and it stays moved', async ({ page }) => {
  await page.goto('/orrery/#focus=Mars')
  await expect(canvas(page)).toHaveAttribute('data-orrery-focus', 'Mars', { timeout: 20_000 })
  await settle(page)
  const before = await focusX(page)
  expect(before).not.toBeNaN()
  await pan(page, 200)
  await settle(page)
  // Held for a moment: the follow used to pull it straight back.
  await page.waitForTimeout(500)
  const after = await focusX(page)
  expect(Math.abs(after - before)).toBeGreaterThan(100)
})

test('with reduced motion (no damping), a pan still moves the view', async ({ page }) => {
  // Without damping, OrbitControls applies the whole pan inside its own pointer handler,
  // before the frame loop runs: a check made only in the frame loop never saw it.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/orrery/#focus=Mars')
  await expect(canvas(page)).toHaveAttribute('data-orrery-focus', 'Mars', { timeout: 20_000 })
  await settle(page)
  const before = await focusX(page)
  await pan(page, 200)
  await settle(page)
  await page.waitForTimeout(500)
  const after = await focusX(page)
  expect(Math.abs(after - before)).toBeGreaterThan(100)
})

test('after closing the inspector, a pan still moves the view', async ({ page }) => {
  await page.goto('/orrery/#focus=Mars')
  await expect(canvas(page)).toHaveAttribute('data-orrery-focus', 'Mars', { timeout: 20_000 })
  await settle(page)
  await page.getByRole('complementary').getByRole('button', { name: 'Close' }).click()
  // Closing it widens the free stage and the focus is re-centred in it: let that finish.
  await page.waitForTimeout(1000)
  await settle(page)
  await expect(canvas(page)).toHaveAttribute('data-orrery-focus', 'Mars')
  const before = await focusX(page)
  await pan(page, -200)
  await settle(page)
  await page.waitForTimeout(500)
  const after = await focusX(page)
  expect(Math.abs(after - before)).toBeGreaterThan(100)
})
