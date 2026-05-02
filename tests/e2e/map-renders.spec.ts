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

  test('globe legend ISS label is visible on default view', async ({ page }) => {
    await page.goto('/')
    // Globe is the default — its legend always shows ISS
    await expect(page.getByText('ISS')).toBeVisible({ timeout: 10_000 })
  })
})
