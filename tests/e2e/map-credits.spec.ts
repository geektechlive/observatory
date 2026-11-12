import { expect, type Page, test } from '@playwright/test'

import { coveredPoints, serveCartoStyle } from './mapCredit'

// The CARTO / OpenStreetMap credit is a licence requirement. #94: MapLibre added its
// default credits control on top of ours, and the ISS plate covered both.

async function openMap(page: Page) {
  await serveCartoStyle(page)
  await page.goto('/')
  await page.getByRole('button', { name: 'Map', exact: true }).click()
  await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 15_000 })
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

// CARTO's terms: the credit must be "Visible on the map, legible, in any corner. Not hidden,
// faded or behind a click" (carto.com/attributions, read 2026-11-08). MapLibre's compact
// control folded it behind a button after the first drag (#179).
test('the credit stays open after the map is dragged (#179)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openMap(page)
  const text = page.locator('.maplibregl-ctrl-attrib-inner')
  await expect(text).toContainText('CARTO', { timeout: 15_000 })
  const box = await page.locator('.maplibregl-canvas').boundingBox()
  if (!box) throw new Error('no map canvas')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2 + 40, { steps: 8 })
  await page.mouse.up()
  await expect(text).toBeVisible()
  await expect(text).toContainText('OpenStreetMap')
})

// OpenAQ requires attribution where its data is used (docs.openaq.org/about/terms), and
// adsb.lol's data is ODbL (#179). Each source carries its own credit, which MapLibre lists
// while one of the source's layers is visible.
for (const { layer, credit } of [
  { layer: 'Air PM2.5', credit: 'OpenAQ' },
  { layer: 'Aircraft', credit: 'adsb.lol' },
]) {
  test(`switching on ${layer} adds ${credit} to the credit line (#179)`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await openMap(page)
    const text = page.locator('.maplibregl-ctrl-attrib-inner')
    await expect(text).toContainText('CARTO', { timeout: 15_000 })
    await expect(text).not.toContainText(credit)
    await page.getByRole('button', { name: /Layers/ }).click()
    await page.getByRole('switch', { name: layer }).click()
    await expect(text).toContainText(credit)
  })
}
