/**
 * The orrery search's JPL fallback (#100). /api/lookup and /api/trajectory are mocked:
 * a name the orrery doesn't carry offers "Search JPL", and the card shows what SBDB says
 * and where Horizons puts it; a missing jpl-queue binding reads as "not available yet".
 */
import { expect, type Page, test } from '@playwright/test'

import { lookupTrajectory } from './lookupPayload'
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

const trajectoryFor = (start: string, end: string, step = '1d') =>
  lookupTrajectory(apophis, start, end, step)

async function openOrrery(page: Page) {
  await page.goto('/#orrery')
  await expect(page.locator('[data-orrery-mode]')).toHaveAttribute('data-orrery-mode', 'webgl', {
    timeout: 20_000,
  })
}

test.beforeEach(async ({ page }) => {
  await offlineSun(page)
})

/**
 * JPL answers for Apophis (#145). The orrery's span request (step 2d) is answered with
 * samples, or a busy queue's 503 + Retry-After; the card's own position check (1d) is
 * always answered. Returns the trajectory requests the orrery made, path and query.
 */
async function stubJpl(page: Page, opts: { busy?: boolean } = {}) {
  const asked: string[] = []
  await page.route('**/api/lookup?*', (route) =>
    route.fulfill({
      json: { query: 'apophis', provider: 'jpl-sbdb', result: { type: 'object', object: apophis } },
    }),
  )
  await page.route('**/api/trajectory?*', (route) => {
    const url = new URL(route.request().url())
    const step = url.searchParams.get('step') ?? '1d'
    if (step !== '1d') asked.push(url.pathname + url.search)
    if (opts.busy && step !== '1d') {
      return route.fulfill({
        status: 503,
        headers: { 'Retry-After': '20', 'X-Error-Kind': 'upstream' },
        json: { error: 'busy' },
      })
    }
    return route.fulfill({
      json: trajectoryFor(
        url.searchParams.get('start') ?? '',
        url.searchParams.get('end') ?? '',
        step,
      ),
    })
  })
  return asked
}

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
    await expect(card.getByRole('button', { name: 'Show in orrery' })).toBeVisible()
    expect(asked[0]).toContain('/api/lookup?q=apophis')
    expect(asked.some((u) => u.startsWith('/api/trajectory?id=sb%3A20099942'))).toBe(true)

    await card.getByRole('button', { name: 'Close' }).click()
    await expect(card).toHaveCount(0)
  })

  test('"Show in orrery" draws it, flies there, links to it, and Remove takes it out (#145)', async ({
    page,
  }) => {
    await stubJpl(page)
    await openOrrery(page)
    await page.getByRole('combobox', { name: /find/i }).fill('apophis')
    await page.getByRole('option', { name: 'Search JPL for “apophis”' }).click()
    const card = page.getByRole('region', { name: 'JPL lookup' })
    await card.getByRole('button', { name: 'Show in orrery' }).click()

    const canvas = page.locator('canvas[data-orrery-webgl]')
    await expect(canvas).toHaveAttribute('data-orrery-lookup', 'lookup:20099942')
    await expect(canvas).toHaveAttribute('data-orrery-focus', 'lookup:20099942')
    // The whole osculating ellipse: 256 points, closed.
    await expect(canvas).toHaveAttribute('data-orrery-lookup-path', '257')
    // Framed in context: the Sun, and Earth for an object within a few au of it.
    await expect(canvas).toHaveAttribute('data-orrery-animating', 'false')
    await expect
      .poll(async () => ((await canvas.getAttribute('data-orrery-onscreen')) ?? '').split(','))
      .toEqual(expect.arrayContaining(['lookup:20099942', 'Sun', 'Earth']))
    const inspector = page.getByRole('complementary', { name: apophis.name })
    await expect(inspector).toContainText('From the Sun')
    await expect(inspector).toContainText(/asked on demand from JPL Horizons/i)
    await expect(page.locator('button[data-kind="lookup"]')).toHaveText('Apophis')
    await expect
      .poll(() => page.evaluate(() => window.location.hash))
      .toContain('focus=lookup:20099942')

    await inspector.getByRole('button', { name: 'Remove from orrery' }).click()
    await expect(canvas).toHaveAttribute('data-orrery-lookup', '')
    await expect(inspector).toHaveCount(0)
    // The camera was following it: with it gone, the focus is cleared, not left on a
    // removed object (#186).
    await expect(canvas).not.toHaveAttribute('data-orrery-focus', /lookup/)
  })

  test('a link to a looked-up object fetches it and opens on it (#145)', async ({ page }) => {
    const asked = await stubJpl(page)
    await page.goto('/#orrery?t=2027-03-01T00:00:00Z&focus=lookup:20099942')
    const canvas = page.locator('canvas[data-orrery-webgl]')
    await expect(canvas).toHaveAttribute('data-orrery-focus', 'lookup:20099942', {
      timeout: 20_000,
    })
    await expect(page.getByRole('complementary', { name: apophis.name })).toContainText(
      'From the Sun',
    )
    // One span around the link's date, never the default date's as well.
    expect(asked.filter((u) => u.startsWith('/api/trajectory'))).toHaveLength(1)
    expect(asked[0]).toContain('id=sb%3A20099942')
  })

  test('a busy JPL queue says so, and how long it asked to wait (#145)', async ({ page }) => {
    await stubJpl(page, { busy: true })
    await openOrrery(page)
    await page.getByRole('combobox', { name: /find/i }).fill('apophis')
    await page.getByRole('option', { name: 'Search JPL for “apophis”' }).click()
    await page
      .getByRole('region', { name: 'JPL lookup' })
      .getByRole('button', { name: 'Show in orrery' })
      .click()
    await expect(page.getByRole('complementary', { name: apophis.name })).toContainText(
      'JPL is busy right now. Trying again in 20 s.',
    )
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
