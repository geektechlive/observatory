/**
 * The Sun view's active regions (#210): SWPC's answers of 2026-11-12, run through the
 * endpoint's own parsers, routed in for /api/solar-regions. Every other feed answers 503,
 * and the SDO image is a 1 px stand-in so no test waits on NASA.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { expect, type Page, test } from '@playwright/test'

import { parseProbabilities, parseRegions } from '../../src/lib/swpcRegions'

const FIXTURES = join(import.meta.dirname, '..', 'unit', 'functions', 'fixtures')
const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(FIXTURES, name), 'utf8')) as unknown
const PROBABILITIES = fixture('swpc-solar-probabilities.json')
const REGIONS = fixture('swpc-solar-regions.json')

const IMAGE_AT = '2026-11-12T05:00:00Z'
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

const FEEDS: Record<string, unknown> = {
  '/api/solar-regions': {
    probabilities: parseProbabilities(PROBABILITIES),
    regions: parseRegions(REGIONS),
    updatedAt: '2026-11-12T05:35:00Z',
  },
  '/api/sdo-times': {
    times: {
      '0171': IMAGE_AT,
      '0193': IMAGE_AT,
      '0211': IMAGE_AT,
      '0304': IMAGE_AT,
      HMIB: IMAGE_AT,
    },
    updatedAt: IMAGE_AT,
  },
}

async function routeFeeds(page: Page) {
  await page.route('**/api/**', async (route) => {
    const body = FEEDS[new URL(route.request().url()).pathname]
    await (body === undefined
      ? route.fulfill({ status: 503, json: { error: 'mock' } })
      : route.fulfill({ json: body }))
  })
  await page.route('https://sdo.gsfc.nasa.gov/**', (route) =>
    route.fulfill({ contentType: 'image/png', body: PIXEL }),
  )
}

test.describe('Sun view: active regions (#210)', () => {
  test.beforeEach(async ({ page }) => {
    await routeFeeds(page)
    await page.goto('/#sun')
  })

  test("the panel shows SWPC's flare odds and its numbered regions, credited", async ({ page }) => {
    const odds = page.getByRole('list', { name: 'Flare odds for 12 Nov' })
    await odds.scrollIntoViewIfNeeded()
    await expect(odds.getByText('45%')).toBeVisible()
    const table = page.getByRole('table', { name: 'Active regions' })
    await expect(table.getByRole('row')).toHaveCount(9)
    await expect(table.getByRole('row', { name: /4566/ })).toContainText('Beta-Gamma')
    await expect(page.getByRole('link', { name: 'NOAA SWPC' })).toHaveAttribute(
      'href',
      'https://www.spaceweather.gov/products/solar-region-summary',
    )
  })

  test('the disc carries a mark per region, and the Regions switch hides them', async ({
    page,
  }) => {
    const marks = page.locator('[data-region]')
    await expect(marks).toHaveCount(8)
    await expect(page.locator('[data-region="4566"]')).toBeVisible()
    const toggle = page.getByRole('button', { name: 'Regions' })
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await expect(marks).toHaveCount(0)
  })
})
