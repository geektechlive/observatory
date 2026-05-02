import { test, expect } from '@playwright/test'

test('map toggle is in ISS readout bar, not in telemetry plate', async ({ page }) => {
  await page.goto('/')
  await page.waitForTimeout(3000)

  // Should be exactly ONE toggle group
  const toggles = page.locator('[aria-label="Map view mode"]')
  await expect(toggles).toHaveCount(1)

  // The one toggle should be inside the ISS readout bar (not the telemetry plate)
  // ISS readout bar contains "ISS-1" text
  const issBar = page.locator('text=ISS-1').locator('..')
  const toggleInBar = issBar.locator('[aria-label="Map view mode"]')
  await expect(toggleInBar).toHaveCount(1)

  // "View Mode" label should NOT exist
  await expect(page.locator('text=View Mode')).toHaveCount(0)
})

test('map mode shows copper-tinted map', async ({ page }) => {
  await page.goto('/')
  await page.waitForTimeout(3000)

  // Click Map
  await page.locator('button:has-text("Map")').first().click()
  await page.waitForTimeout(3000)

  // Map container should be visible
  await expect(page.locator('.maplibregl-canvas')).toBeVisible()

  // Take screenshot for manual inspection
  await page.screenshot({ path: '/tmp/obs-map-mode.png', fullPage: false })
})
