import { test, expect } from '@playwright/test'

test.describe('World map', () => {
  test('map container is present in the DOM after switching to Map mode', async ({ page }) => {
    await page.goto('/')
    // Globe is the default view — switch to flat map first
    await page.getByRole('button', { name: 'Map' }).click()
    // MapLibre renders into a div with class maplibregl-map
    const map = page.locator('.maplibregl-map')
    await expect(map).toHaveCount(1, { timeout: 15_000 })
  })

  test('globe renders on the default view', async ({ page }) => {
    await page.goto('/')
    // Globe is the default view — assert the orthographic globe SVG is present.
    await expect(page.getByRole('img', { name: /Orthographic globe/ })).toBeVisible({
      timeout: 10_000,
    })
  })
})
