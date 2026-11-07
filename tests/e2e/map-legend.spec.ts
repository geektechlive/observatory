import { expect, type Page, test } from '@playwright/test'

// #106: the map's EONET legend sat in the lens's top-left corner, over the Layers
// button and under its opened list. It only renders with live events, so the local
// preview never showed it.

const event = (id: string, category: string, lon: number) => ({
  id,
  title: `Test ${category}`,
  link: 'https://eonet.gsfc.nasa.gov/api/v3/events/test',
  closed: null,
  description: null,
  categories: [{ id: category, title: category }],
  sources: [],
  geometry: [{ type: 'Point', date: '2026-11-01T00:00:00Z', coordinates: [lon, 10] }],
})

const MOCK_EONET = {
  title: 'EONET Events',
  description: 'Natural events',
  link: 'https://eonet.gsfc.nasa.gov/api/v3/events',
  events: [
    event('a', 'wildfires', -100),
    event('b', 'wildfires', 20),
    event('c', 'severeStorms', 80),
    event('d', 'seaLakeIce', 140),
  ],
}

type Box = { left: number; top: number; right: number; bottom: number; name: string }

async function boxes(page: Page): Promise<Box[]> {
  return page.evaluate(() => {
    const pick = (sel: string, name: string) =>
      [...document.querySelectorAll(sel)]
        .map((el) => el.getBoundingClientRect())
        .filter((r) => r.width > 0 && r.height > 0)
        .map((r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom, name }))
    return [
      ...pick('[data-map-legend]', 'legend'),
      ...pick('[aria-label="Map layers"] > button', 'layers button'),
      ...pick('.maplibregl-ctrl-attrib', 'credits'),
      ...pick('[data-lens-plates] > *', 'plate'),
    ]
  })
}

function overlapsWithLegend(all: Box[]): string[] {
  const legend = all.find((b) => b.name === 'legend')
  if (!legend) return ['no legend']
  return all
    .filter((b) => b !== legend)
    .filter(
      (b) =>
        b.left < legend.right &&
        legend.left < b.right &&
        b.top < legend.bottom &&
        legend.top < b.bottom,
    )
    .map((b) => b.name)
}

async function openMapWithEvents(page: Page) {
  await page.route('/api/eonet', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_EONET),
    }),
  )
  await page.goto('/')
  await page.getByRole('button', { name: 'Map', exact: true }).click()
  await expect(page.locator('[data-map-legend]')).toContainText('EONET', { timeout: 15_000 })
  await expect(page.locator('.maplibregl-ctrl-attrib')).toContainText('CARTO', { timeout: 15_000 })
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 390, height: 844 },
]) {
  test(`the legend clears the Layers button, credits and plates at ${viewport.width}px (#106)`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await openMapWithEvents(page)
    await page.locator('[data-map-legend]').scrollIntoViewIfNeeded()
    expect(overlapsWithLegend(await boxes(page))).toEqual([])

    const button = page.locator('[aria-label="Map layers"] > button')
    // On a phone the legend and the button can't share one screen; elementFromPoint
    // only sees what is in the viewport.
    await button.scrollIntoViewIfNeeded()
    const coveredBy = await button.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return hit && el.contains(hit) ? null : (hit?.className ?? 'nothing')
    })
    expect(coveredBy).toBeNull()
  })
}

test('every toggle in the open Layers list is clickable over the legend (#106)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openMapWithEvents(page)
  await page.locator('[aria-label="Map layers"] > button').click()
  const switches = page.locator('[aria-label="Map layers"] [role="switch"]')
  // GLOBE_LAYERS plus the map-only layers; an empty match would pass vacuously.
  expect(await switches.count()).toBeGreaterThan(10)
  const covered = await switches.evaluateAll((els) =>
    els
      .filter((el) => {
        const r = el.getBoundingClientRect()
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        return !hit || !el.contains(hit)
      })
      .map((el) => el.textContent.trim()),
  )
  expect(covered).toEqual([])
})

test('the legend clears everything with the map expanded (#106)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openMapWithEvents(page)
  await page.getByRole('button', { name: 'Expand view' }).click()
  expect(overlapsWithLegend(await boxes(page))).toEqual([])
})
