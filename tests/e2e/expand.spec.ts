/**
 * The larger view (#89): every lens has an Expand button that fills the screen, covers
 * the ticker, and returns on Esc. The globe keeps its one WebGL canvas through it.
 */
import { expect, type Page, test } from '@playwright/test'

test.use({ viewport: { width: 1440, height: 900 } })

const lens = (page: Page) => page.getByRole('region', { name: 'Instrument' })

async function expectFillsViewport(page: Page) {
  await expect
    .poll(async () => (await lens(page).boundingBox())?.height ?? 0, { timeout: 5000 })
    .toBeGreaterThan(890)
  const box = await lens(page).boundingBox()
  expect(box?.x).toBeLessThan(1)
  expect(box?.width).toBeGreaterThan(1430)
  // The ticker sits at the bottom of the screen; the expanded lens must be on top of it.
  const onTop = await page.evaluate(() => {
    const el = document.elementFromPoint(720, window.innerHeight - 10)
    return el?.closest('[aria-label="Instrument"]') !== null
  })
  expect(onTop).toBe(true)
}

async function expectBack(page: Page) {
  await page.keyboard.press('Escape')
  await expect.poll(async () => (await lens(page).boundingBox())?.width ?? 0).toBeLessThan(1200)
  await expect(page.getByRole('button', { name: 'Expand view' })).toBeFocused()
}

test.describe('Expand on every lens (#89)', () => {
  test('the globe grows past its 760px cap and keeps its WebGL canvas', async ({ page }) => {
    await page.goto('/?globe=webgl')
    await expect(page.locator('[data-globe-mode]')).toHaveAttribute('data-globe-mode', 'webgl', {
      timeout: 15_000,
    })
    await page.evaluate(() => {
      ;(window as unknown as { __canvas: Element | null }).__canvas = document.querySelector(
        'canvas[data-globe-webgl]',
      )
    })
    await page.getByRole('button', { name: 'Expand view' }).click()
    await expectFillsViewport(page)
    await expect
      .poll(async () => (await page.locator('[data-globe-mode]').boundingBox())?.width ?? 0)
      .toBeGreaterThan(780)
    const sameCanvas = await page.evaluate(
      () =>
        (window as unknown as { __canvas: Element | null }).__canvas ===
        document.querySelector('canvas[data-globe-webgl]'),
    )
    expect(sameCanvas).toBe(true)
    await expectBack(page)
  })

  test('the flat map fills the screen', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Map', exact: true }).click()
    await expect(page.locator('.maplibregl-map')).toBeVisible({ timeout: 15_000 })
    await page.getByRole('button', { name: 'Expand view' }).click()
    await expectFillsViewport(page)
    await expect
      .poll(async () => (await page.locator('.maplibregl-map').boundingBox())?.height ?? 0)
      .toBeGreaterThan(700)
    await expectBack(page)
  })

  for (const view of ['sun', 'sky'] as const) {
    test(`the ${view} stage fills the screen`, async ({ page }) => {
      await page.goto(`/#${view}`)
      await page.getByRole('button', { name: 'Expand view' }).click()
      await expectFillsViewport(page)
      await expectBack(page)
    })
  }

  test('on a phone it covers the dial bar too', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/#sky')
    await page.getByRole('button', { name: 'Expand view' }).click()
    // The dial bar and the ticker share the bottom of a phone screen.
    for (const y of [812 - 10, 812 - 100]) {
      const onTop = await page.evaluate(
        (py) => document.elementFromPoint(187, py)?.closest('[aria-label="Instrument"]') !== null,
        y,
      )
      expect(onTop).toBe(true)
    }
    const width = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(width).toBeLessThanOrEqual(375)
    await expectBack(page)
  })

  test('the rest of the page is out of reach while expanded', async ({ page }) => {
    await page.goto('/#sun')
    await page.getByRole('button', { name: 'Expand view' }).click()
    // Playwright's role queries ignore `inert`, so check what the keyboard can reach.
    for (let i = 0; i < 12; i += 1) {
      await page.keyboard.press('Tab')
      const outside = await page.evaluate(() => {
        const el = document.activeElement
        if (!el || el === document.body) return null
        return el.closest('[aria-label="Instrument"]') ? null : el.outerHTML.slice(0, 120)
      })
      expect(outside).toBeNull()
    }
    await page.getByRole('button', { name: 'Exit full view' }).click()
    await expect(page.locator('[inert]')).toHaveCount(0)
  })
})
