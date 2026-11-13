/**
 * A re-entry prediction for an object in a switched-off group (#154): the Starlink that
 * TIP lists draws its amber ring and a label with the predicted time and window, from the
 * elements the refresh job stored in the Space-Track catalogue, with Starlink off and
 * without downloading the Starlink group.
 */
import { expect, type Page, test } from '@playwright/test'

import { serveMoons } from './moonPayload'
import { serveNeo } from './neoPayload'
import { REENTRY_NAME, serveStarlinkReentry } from './reentryElementsPayload'
import { serveSats } from './satPayload'
import { offlineSun } from './swpc'

test.beforeEach(async ({ page }) => {
  await offlineSun(page)
})

const canvas = (page: Page) => page.locator('canvas[data-orrery-webgl]')
const attr = async (page: Page, name: string) => (await canvas(page).getAttribute(name)) ?? ''

/** Visible stage labels (a re-entry label among them) whose boxes overlap another's. */
async function overlaps(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const boxes = [
      ...document.querySelectorAll<HTMLElement>(
        '[data-orrery-page] [role="group"][aria-label="Bodies"] button',
      ),
    ]
      .filter((b) => !b.hidden && b.getBoundingClientRect().width > 0)
      .map((b) => ({ text: b.textContent.slice(0, 24), r: b.getBoundingClientRect() }))
    const out: string[] = []
    boxes.forEach((a, i) => {
      for (const b of boxes.slice(i + 1)) {
        // 1 px of slack for rounding at the edges.
        if (
          a.r.left < b.r.right - 1 &&
          a.r.right > b.r.left + 1 &&
          a.r.top < b.r.bottom - 1 &&
          a.r.bottom > b.r.top + 1
        ) {
          out.push(`${a.text} x ${b.text}`)
        }
      }
    })
    return out
  })
}

test.describe('re-entry objects outside the switched-on groups (#154)', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('a Starlink prediction with Starlink off draws one ring and a label', async ({ page }) => {
    await serveMoons(page)
    await serveNeo(page)
    const requested = await serveSats(page)
    await serveStarlinkReentry(page)
    await page.goto('/#orrery')
    await expect(page.locator('[data-orrery-mode]')).toHaveAttribute('data-orrery-mode', 'webgl', {
      timeout: 20_000,
    })
    await page.getByRole('button', { name: 'Earth orbit', exact: true }).click()
    await expect.poll(() => attr(page, 'data-orrery-sat-mode')).toBe('points')
    await expect(page.getByRole('switch', { name: 'Starlink' })).toHaveAttribute(
      'aria-checked',
      'false',
    )
    // The default switches draw 55, and the prediction's own object is not one of them.
    await expect.poll(async () => Number(await attr(page, 'data-orrery-sat-drawn'))).toBe(55)
    await expect.poll(async () => Number(await attr(page, 'data-orrery-sat-reentries'))).toBe(1)
    // Its label says what it is, when it is predicted down, how sure, and whose data it is.
    const label = page.locator('button[data-kind="reentry"]')
    await expect(label).toBeVisible()
    await expect(label).toContainText(REENTRY_NAME)
    await expect(label).toContainText('±12 h')
    await expect(label).toContainText('Space-Track.org')
    // The Starlink group itself was never downloaded.
    expect(requested).not.toContain('starlink')
  })

  // 2026-11-07 had five predictions at once, all Starlinks: every one is ringed, and the
  // labels that show keep off each other and off the rest (#127, #131).
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    test(`five predictions: five rings, labels that do not overlap at ${String(viewport.width)} px`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport)
      await serveMoons(page)
      await serveNeo(page)
      await serveSats(page)
      await serveStarlinkReentry(page, 5)
      await page.goto('/#orrery?preset=orbit')
      await expect(page.locator('[data-orrery-mode]')).toHaveAttribute(
        'data-orrery-mode',
        'webgl',
        { timeout: 20_000 },
      )
      await expect
        .poll(async () => Number(await attr(page, 'data-orrery-sat-reentries')), {
          timeout: 15_000,
        })
        .toBe(5)
      const labels = page.locator('button[data-kind="reentry"]:not([hidden])')
      await expect(labels.first()).toBeVisible()
      await expect.poll(() => overlaps(page), { timeout: 10_000 }).toEqual([])
    })
  }
})
