/**
 * The phone controls sheet (#165): it sits on the stage, below its own Controls / Close
 * controls toggle, so the toggle can always close it, and it ends above the fixed dial bar.
 * Before, the sheet was placed against a far ancestor and grew over the toggle.
 */
import { expect, type Page, test } from '@playwright/test'

import { serveMoons } from './moonPayload'
import { offlineSun } from './swpc'

test.beforeEach(async ({ page }) => {
  await offlineSun(page)
})

async function openOrrery(page: Page) {
  await serveMoons(page)
  await page.goto('/#orrery')
  await expect(page.locator('[data-orrery-mode]')).toHaveAttribute('data-orrery-mode', 'webgl', {
    timeout: 20_000,
  })
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 375, height: 667 },
]) {
  test.describe(`controls sheet at ${String(viewport.width)}×${String(viewport.height)} (#165)`, () => {
    test.use({ viewport })

    test('the open sheet leaves its Close controls toggle visible and usable', async ({ page }) => {
      await openOrrery(page)
      await page.getByRole('button', { name: 'Controls', exact: true }).click()
      const rail = page.locator('#orrery-controls')
      await expect(rail).toHaveAttribute('data-open', 'true')
      const close = page.getByRole('button', { name: 'Close controls' })
      await expect(close).toBeVisible()
      // Nothing sits on top of the toggle: the topmost element at its centre is the toggle.
      const onTop = await close.evaluate((btn) => {
        const r = btn.getBoundingClientRect()
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        return hit !== null && (hit === btn || btn.contains(hit))
      })
      expect(onTop).toBe(true)
      await close.click()
      await expect(rail).not.toHaveAttribute('data-open', 'true')
    })

    test('the open sheet stays inside the stage and above the dial bar', async ({ page }) => {
      await openOrrery(page)
      await page.getByRole('button', { name: 'Controls', exact: true }).click()
      const box = await page.evaluate(() => {
        // On a short screen the page scrolls the stage clear of the fixed dial bar.
        window.scrollTo(0, document.documentElement.scrollHeight)
        const rail = document.getElementById('orrery-controls')
        const stage = document.querySelector('section[aria-label="Orrery"]')
        const dial = [...document.querySelectorAll<HTMLElement>('div')].find(
          (el) => getComputedStyle(el).position === 'fixed' && /dial/i.test(el.className),
        )
        if (!rail || !stage || !dial) return null
        const r = rail.getBoundingClientRect()
        const s = stage.getBoundingClientRect()
        return {
          top: r.top - s.top,
          bottom: s.bottom - r.bottom,
          dial: dial.getBoundingClientRect().top - r.bottom,
        }
      })
      expect(box).not.toBeNull()
      expect(box?.top ?? -1).toBeGreaterThanOrEqual(0)
      expect(box?.bottom ?? -1).toBeGreaterThanOrEqual(0)
      expect(box?.dial ?? -1).toBeGreaterThanOrEqual(0)
    })
  })
}
