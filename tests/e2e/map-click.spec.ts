import { test, expect } from '@playwright/test'

const MINIMAL_STYLE = {
  version: 8,
  sources: {},
  layers: [],
}

const MOCK_EONET = {
  title: 'EONET Events',
  description: 'Natural events',
  link: 'https://eonet.gsfc.nasa.gov/api/v3/events',
  events: [
    {
      id: 'EONET_test_wildfire',
      title: 'Test Wildfire in California',
      link: 'https://eonet.gsfc.nasa.gov/api/v3/events/EONET_test',
      closed: null,
      description: null,
      categories: [{ id: 'wildfires', title: 'Wildfires' }],
      sources: [{ id: 'CALFIRE', url: 'https://www.fire.ca.gov/incidents/test' }],
      geometry: [{ type: 'Point', date: '2026-04-30T00:00:00Z', coordinates: [0, 20] }],
    },
  ],
}

test.describe('Map event dot click', () => {
  test.beforeEach(async ({ page }) => {
    // Serve a minimal local style so the map loads without hitting the CDN
    await page.route('**/dark-matter-nolabels-gl-style/style.json', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MINIMAL_STYLE),
      }),
    )

    // Return a predictable event at the map center [lng=0, lat=20]
    await page.route('/api/eonet', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MOCK_EONET),
      }),
    )

    await page.goto('/')
  })

  test('clicking an event dot shows a popup in the page and does not open a new tab', async ({
    page,
    context,
  }) => {
    const newPages: (typeof page)[] = []
    context.on('page', (p) => newPages.push(p))

    // Wait for map canvas to be present
    await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 15_000 })

    // Give MapLibre time to process the EONET data and render the dot
    await page.waitForTimeout(2_000)

    const mapBox = await page.locator('.maplibregl-canvas').boundingBox()
    if (!mapBox) throw new Error('Map canvas not found')

    // The event is at [lng=0, lat=20], which is the map center
    const cx = mapBox.x + mapBox.width / 2
    const cy = mapBox.y + mapBox.height / 2
    await page.mouse.click(cx, cy)

    // Should not open a new browser tab
    await page.waitForTimeout(500)
    expect(newPages).toHaveLength(0)

    // Should show an in-page popup with the event title
    const popup = page.locator('.maplibregl-popup')
    await expect(popup).toBeVisible({ timeout: 3_000 })
    await expect(popup.getByText('Test Wildfire in California')).toBeVisible()
  })

  test('the popup contains a source link, not the raw API URL', async ({ page }) => {
    await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(2_000)

    const mapBox = await page.locator('.maplibregl-canvas').boundingBox()
    if (!mapBox) throw new Error('Map canvas not found')

    const cx = mapBox.x + mapBox.width / 2
    const cy = mapBox.y + mapBox.height / 2
    await page.mouse.click(cx, cy)

    const popup = page.locator('.maplibregl-popup')
    await expect(popup).toBeVisible({ timeout: 3_000 })

    // The source link should point to the human-readable CALFIRE URL, not the EONET API URL
    const link = popup.locator('a')
    await expect(link).toHaveAttribute('href', 'https://www.fire.ca.gov/incidents/test')
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).not.toHaveAttribute('href', /eonet\.gsfc\.nasa\.gov\/api/)
  })
})
