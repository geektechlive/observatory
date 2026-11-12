import type { Page } from '@playwright/test'

/**
 * CARTO's dark-matter-nolabels style, trimmed to its one source and two of its layers
 * (copied verbatim from the live style.json on 2026-11-12). The credit comes from the
 * source's `attribution`, which MapLibre shows once the style has loaded and a frame has
 * drawn one of the source's layers. If CARTO changes its credit, this copy won't notice;
 * the scheduled health check's `carto-map-credit` does (#221).
 */
const CARTO_STYLE = {
  version: 8,
  // WorldMap adds a symbol layer on load, so the style needs a glyph endpoint (map-health).
  glyphs: 'https://tiles.basemaps.cartocdn.com/v/20261026-01/fonts/{fontstack}/{range}.pbf',
  sources: {
    protomaps: {
      type: 'vector',
      tiles: [
        'https://tiles.basemaps.cartocdn.com/v/20261026-01/vectortiles/carto.streets/v2/{z}/{x}/{y}.mvt',
      ],
      minzoom: 0,
      maxzoom: 15,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/about-carto/">CARTO</a>',
    },
  },
  layers: [
    {
      id: 'background',
      type: 'background',
      layout: { visibility: 'visible' },
      paint: { 'background-color': '#0e0e0e', 'background-opacity': 1 },
    },
    {
      id: 'water',
      type: 'fill',
      source: 'protomaps',
      'source-layer': 'water',
      minzoom: 0,
      maxzoom: 24,
      layout: { visibility: 'visible' },
      paint: {
        'fill-color': '#2C353C',
        'fill-antialias': true,
        'fill-translate-anchor': 'map',
        'fill-opacity': 1,
      },
      filter: ['==', ['geometry-type'], 'Polygon'],
    },
  ],
}

/**
 * Keep the credit tests off CARTO's network (#143). The credit is empty until CARTO's
 * style arrives; in one gate run it hadn't within 15 s. With the style pending the map
 * draws nothing of CARTO's and asks for none of its tiles, so no credit is owed then
 * and the product is right; the test was waiting on a third party. Every CARTO request
 * is refused, as if CARTO were down, except the style, served from the copy above.
 */
export async function serveCartoStyle(page: Page) {
  await page.route('**/*.cartocdn.com/**', (route) => route.abort())
  await page.route('**/dark-matter-nolabels-gl-style/style.json', (route) =>
    route.fulfill({ json: CARTO_STYLE }),
  )
}

/**
 * Points inside the map's credit control that something else sits on top of, plus any lens
 * plate the control overlaps. In #94 the credits drew over the ISS plate, so a cover check
 * alone passed while both were unreadable.
 */
export async function coveredPoints(page: Page) {
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
