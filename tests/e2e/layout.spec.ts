/**
 * The prototype layout (#63): header plate, dial rail left of a dominant lens, the
 * console column on the right, and the remaining panels below.
 */
import { expect, test } from '@playwright/test'

test.describe('Prototype layout (1440 x 900)', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('the dial is a vertical rail left of the lens', async ({ page }) => {
    await page.goto('/')
    const tabs = page.getByRole('tab')
    const earth = await tabs.nth(0).boundingBox()
    const sun = await tabs.nth(1).boundingBox()
    const lens = await page.getByRole('region', { name: 'Instrument' }).boundingBox()
    expect(earth && sun && lens).toBeTruthy()
    if (!earth || !sun || !lens) return
    expect(Math.abs(earth.x - sun.x)).toBeLessThan(4)
    expect(sun.y).toBeGreaterThan(earth.y)
    expect(earth.x + earth.width).toBeLessThanOrEqual(lens.x + 1)
  })

  test('the instrument dominates: wider than 600px', async ({ page }) => {
    await page.goto('/')
    const host = page.locator('[data-globe-mode]')
    await expect(host).toBeVisible()
    // The stage scales in from 0.88, so wait for the settled size.
    await expect
      .poll(async () => (await host.boundingBox())?.width ?? 0, { timeout: 5000 })
      .toBeGreaterThan(600)
  })

  test('the Earth console column shows a voice line and the three Earth panels', async ({
    page,
  }) => {
    await page.goto('/#earth')
    const column = page.getByRole('tabpanel')
    await expect(column.getByText('Seismic, 24 h')).toBeVisible()
    await expect(column.getByText('Geomagnetic')).toBeVisible()
    await expect(column.getByText('Weather alerts, US')).toBeVisible()
    const lens = await page.getByRole('region', { name: 'Instrument' }).boundingBox()
    const col = await column.boundingBox()
    expect((col?.x ?? 0) > (lens?.x ?? 0) + (lens?.width ?? 0) - 1).toBe(true)
  })

  test('Layers is a keyboard disclosure, closed so it never covers the bezel', async ({ page }) => {
    await page.goto('/')
    const chip = page.getByRole('button', { name: /Layers/ })
    const iss = page.getByRole('switch', { name: /ISS/ })
    await expect(chip).toHaveAttribute('aria-expanded', 'false')
    await expect(iss).toBeHidden()
    await chip.focus()
    await page.keyboard.press('Enter')
    await expect(chip).toHaveAttribute('aria-expanded', 'true')
    await expect(iss).toBeVisible()
    await page.keyboard.press('Space')
    await expect(chip).toHaveAttribute('aria-expanded', 'false')
  })

  test('the Belter header and the vitals strip are gone', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText(/TYCHO STATION/)).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Live vital signs' })).toHaveCount(0)
  })
})

for (const width of [390, 768, 1100, 1440]) {
  test(`no horizontal scroll at ${String(width)}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await page.waitForTimeout(500)
    const overflowing = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    )
    expect(overflowing).toBe(false)
  })
}
