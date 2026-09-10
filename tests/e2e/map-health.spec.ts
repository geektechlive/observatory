import { expect, test } from '@playwright/test'

/**
 * Characterization guard for the MapLibre integration.
 *
 * map-click.spec.ts proves the map is interactive, but it stays green even when
 * the style is fatally misconfigured: MapLibre reports most failures by firing
 * an `error` event, and WorldMap registers no `error` listener, so a broken
 * source or a rejected style expression surfaces only as a console error that
 * nothing asserts on.
 *
 * This spec closes that gap, which matters most across a major upgrade — v6
 * moved to style-spec 25, which raises an error on legacy expressions instead
 * of failing silently, and dropped WebGL1 so a context failure is now fatal.
 *
 * Verified to have teeth: adding a layer that references a non-existent source
 * to MINIMAL_STYLE makes this test fail.
 *
 * It also asserts the worker script is real JavaScript. That is not paranoia:
 * v6 resolves its worker at runtime from `import.meta.url`, which no bundler
 * detects statically, so the asset went unemitted and the dev server answered
 * the request with the SPA's index.html — HTTP 200, no console error, and
 * every GeoJSON source (ISS, quakes, fires, EONET, NWS, aircraft, buoys)
 * silently dead while the raster basemap still drew. Only the content type
 * gave it away.
 */

/**
 * `glyphs` is declared because WorldMap adds the `iss-label` symbol layer
 * unconditionally on load. It only escapes needing a glyph endpoint today
 * because /api/iss is unmocked here, so the layer has no features to label.
 */
const MINIMAL_STYLE = {
  version: 8,
  glyphs: 'https://basemaps.cartocdn.com/gl/fonts/{fontstack}/{range}.pbf',
  sources: {},
  layers: [],
}

test.describe('Map health', () => {
  test('loads the map without emitting an error or console failure', async ({ page }) => {
    const errors: string[] = []
    const workerUrls: string[] = []

    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text())
    })
    page.on('pageerror', (err) => errors.push(err.message))
    page.on('worker', (worker) => workerUrls.push(worker.url()))

    await page.route('**/dark-matter-nolabels-gl-style/style.json', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(MINIMAL_STYLE),
      }),
    )

    await page.goto('/')
    await page.getByRole('button', { name: 'Map' }).click()

    // The canvas exists as soon as the Map is constructed, so on its own it is
    // not evidence the style resolved. The attribution control is only rendered
    // once MapLibre has loaded a style.
    await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 15_000 })
    await expect(page.locator('.maplibregl-ctrl-attrib').first()).toBeAttached({ timeout: 15_000 })

    // Upstream data endpoints are unmocked and may legitimately fail here; only
    // MapLibre's own style/render failures should fail this test.
    const mapErrors = errors.filter((e) => !/Failed to (load|fetch)|ERR_|net::/i.test(e))

    expect(mapErrors, 'MapLibre reported errors while loading the style').toEqual([])

    const mapWorkers = workerUrls.filter((u) => /maplibre/.test(u))
    expect(mapWorkers, 'MapLibre never started its worker').not.toEqual([])

    // A worker served as index.html still returns 200, so the status alone
    // proves nothing — the content type is what distinguishes a real module
    // from the SPA fallback.
    for (const url of mapWorkers) {
      const res = await page.request.get(url)
      expect(res.status(), `worker ${url} was not served`).toBe(200)
      expect(
        res.headers()['content-type'] ?? '',
        `worker ${url} was not served as JavaScript`,
      ).toMatch(/javascript/)
    }
  })
})
