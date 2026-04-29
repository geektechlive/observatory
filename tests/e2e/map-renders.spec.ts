import { test, expect } from '@playwright/test'

test.describe('World map', () => {
  test('map container is present in the DOM', async ({ page }) => {
    await page.goto('/')
    // MapLibre renders into a div with class maplibregl-map
    const map = page.locator('.maplibregl-map')
    await expect(map).toHaveCount(1, { timeout: 10_000 })
  })

  test('map legend is visible', async ({ page }) => {
    await page.goto('/')
    // The MapLegend component renders with a label containing "ISS"
    await expect(page.getByText('ISS')).toBeVisible({ timeout: 10_000 })
  })
})
