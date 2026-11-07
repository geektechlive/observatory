/**
 * The orrery search's JPL fallback (#100). /api/lookup and /api/trajectory are mocked:
 * a name the orrery doesn't carry offers "Search JPL", and the card shows what SBDB says
 * and where Horizons puts it; a missing jpl-queue binding reads as "not available yet".
 */
import { expect, type Page, test } from '@playwright/test'

import { offlineSun } from './swpc'

const apophis = {
  id: 'sb:20099942',
  spkid: '20099942',
  name: '99942 Apophis (2004 MN4)',
  designation: '99942',
  prefix: null,
  kind: 'asteroid',
  orbitClass: { code: 'ATE', name: 'Aten' },
  neo: true,
  pha: true,
}

function trajectoryFor(start: string, end: string) {
  const jd0 = Date.parse(`${start}T00:00:00Z`) / 86_400_000 + 2440587.5
  return {
    generatedAt: new Date().toISOString(),
    frame: 'ecliptic-J2000',
    center: 'Sun',
    timeScale: 'TDB',
    units: { position: 'au', velocity: 'au/day' },
    sourceType: 'ephemeris',
    provider: 'jpl-horizons',
    object: apophis,
    target: apophis.name,
    request: { start, end, stepMinutes: 1440 },
    fine: {
      start: jd0,
      step: 1,
      samples: [
        0.5, -0.8, 0.01, 0.015, 0.01, 0, 0.51, -0.79, 0.01, 0.015, 0.01, 0, 0.52, -0.78, 0.01,
        0.015, 0.01, 0,
      ],
    },
    availableFrom: null,
    availableTo: null,
  }
}

async function openOrrery(page: Page) {
  await page.goto('/#orrery')
  await expect(page.locator('[data-orrery-mode]')).toHaveAttribute('data-orrery-mode', 'webgl', {
    timeout: 20_000,
  })
}

test.beforeEach(async ({ page }) => {
  await offlineSun(page)
})

test.describe('JPL lookup from the orrery search (#100)', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('a name the orrery lacks is looked up at JPL', async ({ page }) => {
    const asked: string[] = []
    await page.route('**/api/lookup?*', (route) => {
      asked.push(route.request().url())
      return route.fulfill({
        json: {
          query: 'apophis',
          provider: 'jpl-sbdb',
          result: { type: 'object', object: apophis },
        },
      })
    })
    await page.route('**/api/trajectory?*', (route) => {
      const url = new URL(route.request().url())
      asked.push(url.pathname + url.search)
      return route.fulfill({
        json: trajectoryFor(url.searchParams.get('start') ?? '', url.searchParams.get('end') ?? ''),
      })
    })
    await openOrrery(page)

    const search = page.getByRole('combobox', { name: /find/i })
    await search.fill('mars')
    await expect(page.getByRole('option', { name: /search jpl/i })).toHaveCount(0)
    await search.fill('apophis')
    await page.getByRole('option', { name: 'Search JPL for “apophis”' }).click()

    const card = page.getByRole('region', { name: 'JPL lookup' })
    await expect(card.getByRole('heading', { name: apophis.name })).toBeVisible()
    await expect(card).toContainText('Potentially hazardous')
    await expect(card).toContainText(/au from the Sun/)
    await expect(card).toContainText(/not drawn in the 3D scene/i)
    expect(asked[0]).toContain('/api/lookup?q=apophis')
    expect(asked.some((u) => u.startsWith('/api/trajectory?id=sb%3A20099942'))).toBe(true)

    await card.getByRole('button', { name: 'Close' }).click()
    await expect(card).toHaveCount(0)
  })

  test('says so when lookup is not set up', async ({ page }) => {
    await page.route('**/api/lookup?*', (route) =>
      route.fulfill({
        status: 503,
        headers: { 'X-Not-Configured': 'jpl-queue', 'X-Error-Kind': 'upstream' },
        json: { error: 'On-demand JPL lookup is not set up yet' },
      }),
    )
    await openOrrery(page)
    await page.getByRole('combobox', { name: /find/i }).fill('2026 VP*')
    await page.keyboard.press('Enter')
    await expect(page.getByRole('region', { name: 'JPL lookup' })).toContainText(
      'isn’t available yet',
    )
  })
})
