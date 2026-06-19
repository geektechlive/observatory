import { test, expect } from '@playwright/test'

test.describe('The Instrument', () => {
  test('vital-signs spine is present', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByLabel('Live vital signs')).toBeVisible()
  })

  test('orbital dial switches console and updates the hash', async ({ page }) => {
    await page.goto('/')
    // default view is earth
    await expect.poll(() => page.url()).toContain('#earth')

    await page.getByRole('tab', { name: /SUN/ }).click()
    await expect.poll(() => page.url()).toContain('#sun')
    await expect(page.getByText('Heliophysics', { exact: false })).toBeVisible()
  })

  test('deep-linking a hash boots the right console', async ({ page }) => {
    await page.goto('/#sky')
    await expect(page.getByRole('tab', { name: /SKY/ })).toHaveAttribute('aria-selected', 'true')
  })

  test('layer control toggles a layer', async ({ page }) => {
    await page.goto('/')
    const fires = page.getByRole('switch', { name: /Fires/ })
    await expect(fires).toHaveAttribute('aria-checked', 'false')
    await fires.click()
    await expect(fires).toHaveAttribute('aria-checked', 'true')
  })
})
