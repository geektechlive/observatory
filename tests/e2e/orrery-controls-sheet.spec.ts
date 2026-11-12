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

    // #208: "Close controls" is wider than "Controls", and the stage's Guide button sat at a
    // fixed offset beside it, so the open sheet's toggle covered it ("…uide").
    for (const sheet of ['closed', 'open'] as const) {
      test(`no two stage toolbar items overlap with the sheet ${sheet} (#208)`, async ({
        page,
      }) => {
        await openOrrery(page)
        if (sheet === 'open') {
          await page.getByRole('button', { name: 'Controls', exact: true }).click()
          await expect(page.locator('#orrery-controls')).toHaveAttribute('data-open', 'true')
        }
        const items = await page.evaluate(() => {
          const stage = document.querySelector('section[aria-label="Orrery"]')
          if (!stage) return null
          // The stage's own buttons (Controls, Guide) and its scale badge, as laid out.
          return [
            ...stage.querySelectorAll<HTMLElement>(
              ':scope > button, :scope > p[data-label-obstacle]',
            ),
          ]
            .map((el) => {
              const r = el.getBoundingClientRect()
              return { name: el.textContent.trim(), l: r.left, r: r.right, t: r.top, b: r.bottom }
            })
            .filter((b) => b.r > b.l && b.b > b.t)
        })
        expect(items).not.toBeNull()
        const names = (items ?? []).map((i) => i.name)
        expect(names).toContain(sheet === 'open' ? 'Close controls' : 'Controls')
        // The stage's Guide button is hidden while the sheet (with its own Guide) is open,
        // and back when it closes; the check above would pass trivially without this.
        if (sheet === 'open') expect(names).not.toContain('Guide')
        else expect(names).toContain('Guide')
        const overlaps: string[] = []
        for (const [i, a] of (items ?? []).entries()) {
          for (const b of (items ?? []).slice(i + 1)) {
            if (a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b)
              overlaps.push(`${a.name} × ${b.name}`)
          }
        }
        expect(overlaps).toEqual([])
      })
    }

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
