import { expect, type Page, test } from '@playwright/test'

// The CARTO / OpenStreetMap credit is a licence requirement. #94: MapLibre added its
// default credits control on top of ours, and the ISS plate covered both.

async function openMap(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Map', exact: true }).click()
  await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 15_000 })
}

/**
 * Points inside the control that something else sits on top of, plus any lens plate
 * the control overlaps. In #94 the credits drew over the ISS plate, so a cover check
 * alone passed while both were unreadable.
 */
async function coveredPoints(page: Page) {
  return page.locator('.maplibregl-ctrl-attrib').evaluate((el) => {
    const r = el.getBoundingClientRect()
    const overlaps = [...document.querySelectorAll('[data-lens-plates] > *')]
      .map((plate) => plate.getBoundingClientRect())
      .filter((p) => p.width > 0 && p.height > 0)
      .filter((p) => p.left < r.right && r.left < p.right && p.top < r.bottom && r.top < p.bottom)
      .map((p) => `overlaps plate at ${Math.round(p.left)},${Math.round(p.top)}`)
    const points: [number, number][] = [
      [r.left + r.width / 2, r.top + r.height / 2],
      [r.left + 3, r.top + 3],
      [r.right - 3, r.top + 3],
      [r.left + 3, r.bottom - 3],
      [r.right - 3, r.bottom - 3],
    ]
    const covered = points
      .filter(([x, y]) => {
        const hit = document.elementFromPoint(x, y)
        return !hit || !el.contains(hit)
      })
      .map(([x, y]) => {
        const hit = document.elementFromPoint(x, y)
        return `${Math.round(x)},${Math.round(y)} ${hit?.className ?? 'nothing'}`
      })
    return [...covered, ...overlaps]
  })
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
]) {
  test(`one map credit line, readable and uncovered at ${viewport.width}px (#94)`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await openMap(page)
    const credits = page.locator('.maplibregl-ctrl-attrib')
    await expect(credits).toHaveCount(1)
    await expect(credits).toContainText('OpenStreetMap', { timeout: 15_000 })
    await expect(credits).toContainText('CARTO')
    await credits.scrollIntoViewIfNeeded()
    expect(await coveredPoints(page)).toEqual([])
  })
}

test('the credit stays uncovered with the map expanded (#94)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openMap(page)
  await page.getByRole('button', { name: 'Expand view' }).click()
  const credits = page.locator('.maplibregl-ctrl-attrib')
  await expect(credits).toHaveCount(1)
  await expect(credits).toContainText('CARTO', { timeout: 15_000 })
  expect(await coveredPoints(page)).toEqual([])
})
