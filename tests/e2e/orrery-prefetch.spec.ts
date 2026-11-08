import { expect, test } from '@playwright/test'

// #168: reaching for the Orrery tab downloads its chunks as modulepreload links, which
// compile but do not run, so the orrery page itself is not mounted.
test('hovering the Orrery tab preloads its chunks without running them', async ({ page }) => {
  await page.goto('/')
  const orreryLinks = page.locator('link[rel="modulepreload"][href*="/assets/OrreryPage-"]')
  await expect(orreryLinks).toHaveCount(0)

  await page.getByRole('tab', { name: /ORRERY/ }).hover()
  await expect(orreryLinks).toHaveCount(1)
  await expect(
    page.locator('link[rel="modulepreload"][href*="/assets/OrreryRenderer-"]'),
  ).toHaveCount(1)
  await expect(page.locator('[data-orrery-page]')).toHaveCount(0)
})
