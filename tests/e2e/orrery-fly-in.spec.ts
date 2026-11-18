/**
 * The fly-in (#261): with ESA DISCOS sizes for a craft, its close-up is true to life. The model
 * is scaled to its real size, and the camera flies in from about 1,000,000 km to arrival in
 * about four seconds, or cuts straight there with reduced motion. Without DISCOS sizes the
 * close-up stays the studio "Look closer". /api/orrery-bodies and /api/discos are mocked.
 */
import { expect, type Page, test } from '@playwright/test'

import { offlineSun } from './swpc'

test.use({ viewport: { width: 1440, height: 900 } })

const DAY_MS = 86_400_000
const JD_UNIX = 2440587.5
const jdNow = () => Math.floor(Date.now() / DAY_MS) + JD_UNIX

function track(naifId: string, name: string, pos: [number, number, number]) {
  const start = jdNow() - 30
  const fine: number[] = []
  for (let i = 0; i <= 60; i += 1) fine.push(...pos, 0, 0, 0)
  return {
    id: `naif:${naifId}`,
    naifId,
    name,
    mission: `${name} (test)`,
    category: 'spacecraft',
    group: 'mission',
    target: `${name} (spacecraft) (${naifId})`,
    observedUntil: null,
    availableFrom: null,
    availableTo: null,
    fine: { start, step: 1, samples: fine },
    coarse: null,
  }
}

const BODIES = {
  generatedAt: new Date().toISOString(),
  coarseFetchedAt: new Date().toISOString(),
  frame: 'ecliptic-J2000',
  center: 'Sun',
  timeScale: 'TDB',
  units: { position: 'au', velocity: 'au/day' },
  sourceType: 'ephemeris',
  provider: 'jpl-horizons',
  bodies: [
    track('-96', 'Parker Solar Probe', [0.2, 0.15, 0.01]),
    track('-31', 'Voyager 1', [-30, 120, 60]),
  ],
  missing: [],
}

function discosObject(o: Record<string, unknown>) {
  return {
    cosparId: null,
    satno: null,
    name: 'x',
    objectClass: null,
    massKg: null,
    shape: null,
    widthM: null,
    heightM: null,
    depthM: null,
    diameterM: null,
    spanM: null,
    xSectMaxM2: null,
    operators: [],
    firstEpoch: null,
    fetchedAt: new Date().toISOString(),
    ...o,
  }
}

async function serve(page: Page) {
  await offlineSun(page)
  await page.route('**/api/orrery-bodies', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(BODIES) }),
  )
  // Parker has sizes; Voyager 1 has none, so it keeps the studio view.
  await page.route('**/api/discos', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        generatedAt: new Date().toISOString(),
        citation: 'ESA DISCOS (DISCOSweb)',
        craft: {
          '-96': discosObject({ name: 'Parker Solar Probe', diameterM: 2.3, heightM: 3, spanM: 3 }),
        },
        satellites: {},
        missing: [],
      }),
    }),
  )
}

const detailView = (page: Page) => page.locator('[data-detail-view]')
const detailCanvas = (page: Page) => page.locator('canvas[data-detail-canvas]')
/** The camera's distance from the craft, scene units. */
const distance = async (page: Page) =>
  Number(((await detailCanvas(page).getAttribute('data-detail-camera')) ?? ',,NaN').split(',')[2])

async function open(page: Page, naif: string) {
  await serve(page)
  await page.goto(`/orrery/#focus=naif:${naif}&detail=1`)
  await expect(detailView(page)).toHaveAttribute('data-detail-status', 'ready', {
    timeout: 20_000,
  })
}

test('Parker flies in from far out to arrival, at its real size', async ({ page }) => {
  await open(page, '-96')
  // A 3 m body and a 3 m span: the body is scaled, one unit (its robust radius) = 1.5 m.
  await expect(detailCanvas(page)).toHaveAttribute('data-detail-metres-per-unit', '1.5000')
  // Early in the flight the camera is still thousands of km out.
  expect(await distance(page)).toBeGreaterThan(1_000)
  // About four seconds later it has arrived, a few model lengths away.
  await expect.poll(() => distance(page), { timeout: 8_000 }).toBeLessThan(20)
})

test('a target bracket and range mark the craft while it is too small to see (#261)', async ({
  page,
}) => {
  await open(page, '-96')
  const target = page.locator('[data-detail-target]')
  // Far out the craft is under a pixel: the bracket is at full strength with a km range.
  await expect(target).toHaveCSS('opacity', '1')
  await expect(target).toContainText(/km$/)
  // At arrival the model fills the view and the bracket has faded out.
  await expect.poll(() => distance(page), { timeout: 8_000 }).toBeLessThan(20)
  await expect(target).toHaveCSS('opacity', '0')
  expect(Number(await target.getAttribute('data-detail-target-radius'))).toBeGreaterThan(40)
})

test('with reduced motion there is no flight: the camera starts at arrival', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(page, '-96')
  await expect.poll(() => distance(page), { timeout: 2_000 }).toBeLessThan(20)
})

test('opening and closing the fly-in leaves nothing on the GPU', async ({ page }) => {
  test.setTimeout(90_000)
  await open(page, '-96')
  for (let i = 0; i < 3; i += 1) {
    if (i > 0) {
      await page.getByRole('button', { name: 'Look closer' }).click()
      await expect(detailView(page)).toHaveAttribute('data-detail-status', 'ready', {
        timeout: 20_000,
      })
    }
    // The sky is on the GPU too while the view is open.
    await expect(detailCanvas(page)).toHaveAttribute('data-detail-metres-per-unit', '1.5000')
    await detailView(page).getByRole('button', { name: 'Back to orrery' }).click()
    await expect(detailView(page)).toHaveCount(0)
  }
  const root = page.locator('[data-orrery-page]')
  await expect(root).toHaveAttribute('data-orrery-detail-leaked', '0')
  await expect(root).toHaveAttribute('data-orrery-detail-scenes', '0')
})

test('a craft without DISCOS sizes keeps the studio close-up', async ({ page }) => {
  await open(page, '-31')
  expect(await detailCanvas(page).getAttribute('data-detail-metres-per-unit')).toBeNull()
  expect(await distance(page)).toBeLessThan(20)
  // The studio has no flight, so no target bracket.
  await expect(page.locator('[data-detail-target]')).toHaveCount(0)
})
