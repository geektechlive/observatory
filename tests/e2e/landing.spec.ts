import { test, expect } from '@playwright/test'

test.describe('Landing page', () => {
  test('loads and has correct title', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle('cosmo.observatory')
  })

  test('status bar is visible', async ({ page }) => {
    await page.goto('/')
    const statusBar = page.locator('nav[aria-label="Observatory status"]')
    await expect(statusBar).toBeVisible()
  })

  test('brand mark is present', async ({ page }) => {
    await page.goto('/')
    const nav = page.locator('nav[aria-label="Observatory status"]')
    await expect(nav.getByText('cosmo')).toBeVisible()
  })

  test('main content area is present', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('main')).toBeVisible()
  })

  test('skip link is in the DOM', async ({ page }) => {
    await page.goto('/')
    const skipLink = page.locator('a.skip-link, a[href="#main-content"]')
    await expect(skipLink).toHaveCount(1)
  })

  test('About button opens popover', async ({ page }) => {
    await page.goto('/')
    const aboutBtn = page.getByRole('button', { name: /about/i })
    await aboutBtn.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('dialog').getByText('cosmo-tui')).toBeVisible()
  })

  test('About popover closes on Escape', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /about/i }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })
})
