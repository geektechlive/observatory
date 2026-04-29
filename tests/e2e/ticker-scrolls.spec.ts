import { test, expect } from '@playwright/test'

test.describe('Ticker', () => {
  test('ticker band is present at the bottom of the page', async ({ page }) => {
    await page.goto('/')
    // The ticker has role="region" and is positioned at the bottom
    const ticker = page.locator('[role="region"][aria-label*="ive"]')
    await expect(ticker).toHaveCount(1, { timeout: 10_000 })
  })

  test('ticker LIVE label is visible', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('LIVE')).toBeVisible({ timeout: 10_000 })
  })
})
