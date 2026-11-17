/**
 * The orrery's time bar (#117): #114's three extra rates pushed "Go to date" onto a second
 * row at 1440 px. The controls fit (936 px of 950); the scrubber's 160 px flex basis broke
 * the row before it shrank. From 1366 px up the bar is one row; at 1280 it needs 856 of
 * 790 px and wraps to two rows; on a phone every control stays reachable.
 */
import { expect, type Page, test } from '@playwright/test'

import { serveMoons } from './moonPayload'
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
    const rate = page.getByRole('button', { name })
    await rate.scrollIntoViewIfNeeded()
    await expect(rate).toBeInViewport()
  }
})

test('on a phone "Go to date" is in the Controls sheet and moves the clock (#242)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openOrrery(page)
  await page.getByRole('button', { name: /^Controls/ }).click()
  const date = page.getByRole('textbox', { name: /Go to date/ })
  await expect(date).toBeVisible()
  await date.fill('2026-12-03')
  await date.press('Enter')
  await expect(
    page
      .locator('output')
      .filter({ hasText: /2026-12-03/ })
      .first(),
  ).toBeAttached()
  await expect(bar(page).getByText(/2026-12-03/)).toBeVisible()
})

test.describe('phone touch targets (#243)', () => {
  test.use({ viewport: { width: 375, height: 760 } })

  test('the bar buttons are at least 40 px each way, on three rows, under the chip', async ({
    page,
  }) => {
    await openOrrery(page)
    const boxes = await bar(page).evaluate((el) =>
      [...el.querySelectorAll('button')]
        .map((b) => ({
          name: b.getAttribute('aria-label') ?? b.textContent,
          r: b.getBoundingClientRect(),
        }))
        .filter(({ r }) => r.width > 0)
        .map(({ name, r }) => ({ name, w: r.width, h: r.height })),
    )
    expect(boxes.length).toBeGreaterThanOrEqual(9)
    for (const b of boxes) {
      expect(b.h, b.name).toBeGreaterThanOrEqual(40)
      expect(b.w, b.name).toBeGreaterThanOrEqual(40)
    }
    expect(await rows(page)).toBe(3)
    // The first-visit chip sits above the bar, not over it.
    const chip = await page.getByRole('note').filter({ hasText: 'New here?' }).boundingBox()
    const barBox = await bar(page).boundingBox()
    expect(chip).not.toBeNull()
    expect((chip?.y ?? 0) + (chip?.height ?? 0)).toBeLessThanOrEqual(barBox?.y ?? 0)
  })

  test('the Earth orbit preset still opens the Earth frame under the taller bar', async ({
    page,
  }) => {
    // Horizons' Earth for the date: without it the frame stays closed.
    await serveMoons(page)
    await openOrrery(page)
    const controls = page.getByRole('button', { name: 'Controls', exact: true })
    await controls.click()
    await page.getByRole('button', { name: 'Earth orbit', exact: true }).click()
    const canvas = page.locator('canvas[data-orrery-webgl]')
    await expect
      .poll(async () => (await canvas.getAttribute('data-orrery-earth-frame')) ?? '', {
        timeout: 15_000,
      })
      .toBe('1.00')
  })
})
