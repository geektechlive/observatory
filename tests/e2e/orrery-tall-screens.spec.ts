/**
 * The orrery's stage fills tall screens (#201): it used to stop at 1200 px, leaving a
 * 3840 x 2160 screen half empty. Its height follows the viewport at any size.
 */
import { expect, test } from '@playwright/test'

import { offlineSun } from './swpc'

/** The stage is the viewport less the header, voice line and margins (orrery.module.css). */
const CHROME_PX = 220

for (const size of [
  { width: 2560, height: 1440 },
  { width: 3840, height: 2160 },
]) {
  test.describe(`${String(size.width)} x ${String(size.height)}`, () => {
    test.use({ viewport: size })

    test('the stage height follows the viewport, with no horizontal overflow', async ({ page }) => {
      await offlineSun(page)
      await page.goto('/#orrery')
      const stage = page.getByRole('region', { name: 'Orrery', exact: true })
      await expect(stage).toBeVisible()
      const box = await stage.boundingBox()
      expect(box).toBeTruthy()
      expect(Math.abs((box?.height ?? 0) - (size.height - CHROME_PX))).toBeLessThanOrEqual(2)
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )
      expect(overflow).toBeLessThanOrEqual(0)
    })
  })
}
