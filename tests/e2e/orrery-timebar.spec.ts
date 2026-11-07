/**
 * The orrery's time bar (#117): #114's three extra rates pushed "Go to date" onto a second
 * row at 1440 px. The controls fit (936 px of 950); the scrubber's 160 px flex basis broke
 * the row before it shrank. From 1366 px up the bar is one row; at 1280 it needs 856 of
 * 790 px and wraps to two rows; on a phone every control stays reachable.
 */
import { expect, type Page, test } from '@playwright/test'

import { offlineSun } from './swpc'

test.beforeEach(async ({ page }) => {
  await offlineSun(page)
})

const bar = (page: Page) => page.getByRole('group', { name: 'Simulation time' })

async function openOrrery(page: Page) {
  await page.goto('/#orrery')
  await expect(page.locator('[data-orrery-mode]')).toHaveAttribute('data-orrery-mode', 'webgl', {
    timeout: 20_000,
  })
}

/** The distinct rows the bar's direct children sit on, by their vertical centre. */
async function rows(page: Page): Promise<number> {
  return bar(page).evaluate((el) => {
    const centres = [...el.children]
      .map((c) => c.getBoundingClientRect())
      .filter((r) => r.width > 0 && r.height > 0)
      .map((r) => r.top + r.height / 2)
    const distinct: number[] = []
    for (const c of centres) if (!distinct.some((d) => Math.abs(d - c) < 8)) distinct.push(c)
    return distinct.length
  })
}

for (const width of [1440, 1366]) {
  test(`the time bar is one row at ${width} px (#117)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await openOrrery(page)
    await expect(bar(page)).toBeVisible()
    expect(await rows(page)).toBe(1)
    await expect(page.getByRole('textbox', { name: /Go to date/ })).toBeVisible()
  })
}

test('on a phone every rate is reachable and the bar fits the screen (#117)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openOrrery(page)
  const box = await bar(page).boundingBox()
  expect(box).not.toBeNull()
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390)
  for (const name of ['1 day/s', '1 wk/s', '1 mo/s', '1 yr/s']) {
    const rate = page.getByRole('radio', { name })
    await rate.scrollIntoViewIfNeeded()
    await expect(rate).toBeInViewport()
  }
})
