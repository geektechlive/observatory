import { expect, test } from '@playwright/test'

test.describe('Mobile layout (390 x 844)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('console dial is reachable without scrolling', async ({ page }) => {
    await page.goto('/')
    const dial = page.getByRole('tablist', { name: 'Observatory console' })
    await expect(dial).toBeInViewport()
  })

  test('Layers chip expands and collapses the layer list', async ({ page }) => {
    await page.goto('/')
    const chip = page.getByRole('button', { name: /Layers/ })
    await expect(chip).toHaveAttribute('aria-expanded', 'false')

    const iss = page.getByRole('switch', { name: /ISS/ })
    await expect(iss).not.toBeVisible()

    await chip.click()
    await expect(chip).toHaveAttribute('aria-expanded', 'true')
    await expect(iss).toBeVisible()

    await chip.click()
    await expect(chip).toHaveAttribute('aria-expanded', 'false')
    await expect(iss).not.toBeVisible()
  })

  test('page has no horizontal overflow', async ({ page }) => {
    await page.goto('/')
    const overflowing = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    )
    expect(overflowing).toBe(false)
  })
})
