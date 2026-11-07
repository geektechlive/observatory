/**
 * The orrery's shareable link (#108): `#orrery?t=…&focus=…&preset=…` opens that view,
 * and the page keeps the address in step with replaceState, never adding history.
 * /api/orrery-bodies is mocked with Voyager 1 on a straight line through today.
 */
import { expect, type Page, test } from '@playwright/test'

import { offlineSun } from './swpc'

const DAY_MS = 86_400_000
const JD_UNIX = 2440587.5
const jdNow = () => Math.floor(Date.now() / DAY_MS) + JD_UNIX

function voyager1() {
  const pos = [-32.2, -137.1, 99.2]
  const vel = [-0.0012, -0.00786, 0.00568]
  const at = (t: number) => pos.map((p, i) => p + (vel[i] ?? 0) * t)
  const fine: number[] = []
  for (let t = -30; t <= 30; t += 1) fine.push(...at(t), ...vel)
  // A whole-mission span back past 2012, as the real payload has (#93).
  const coarseStart = jdNow() - 6000
  const coarse: number[] = []
  for (let i = 0; i <= 61; i += 1) coarse.push(...at(coarseStart + i * 100 - jdNow()))
  return {
    id: 'naif:-31',
    naifId: '-31',
    name: 'Voyager 1',
    mission: 'Voyager 1 (test)',
    category: 'spacecraft',
    group: 'deep-space',
    target: 'Voyager 1 (spacecraft) (-31)',
    observedUntil: null,
    availableFrom: null,
    availableTo: null,
    fine: { start: jdNow() - 30, step: 1, samples: fine },
    coarse: { start: coarseStart, step: 100, samples: coarse },
  }
}

async function mockBodies(page: Page) {
  await offlineSun(page)
  await page.route('**/api/orrery-bodies', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        generatedAt: new Date().toISOString(),
        coarseFetchedAt: new Date().toISOString(),
        frame: 'ecliptic-J2000',
        center: 'Sun',
        timeScale: 'TDB',
        units: { position: 'au', velocity: 'au/day' },
        sourceType: 'ephemeris',
        provider: 'jpl-horizons',
        bodies: [voyager1()],
        missing: [],
      }),
    }),
  )
}

async function open(page: Page, hash: string) {
  await mockBodies(page)
  await page.goto(`/${hash}`)
  await expect(page.locator('[data-orrery-mode]')).toHaveAttribute('data-orrery-mode', 'webgl', {
    timeout: 15_000,
  })
}

const hash = (page: Page) => page.evaluate(() => window.location.hash)
const historyLength = (page: Page) => page.evaluate(() => window.history.length)
const canvas = (page: Page) => page.locator('canvas[data-orrery-webgl]')

test.describe('Orrery shareable links (#108)', () => {
  test('a deep link opens Voyager 1 on its heliopause day, paused; a scrub rewrites it in place', async ({
    page,
  }) => {
    await open(page, '#orrery?t=2012-08-25T00:00:00Z&focus=naif:-31')

    await expect(page.getByRole('complementary', { name: 'Voyager 1' })).toBeVisible()
    await expect(canvas(page)).toHaveAttribute('data-orrery-focus', 'naif:-31')
    const timeBar = page.getByRole('group', { name: 'Simulation time' })
    await expect(timeBar.locator('output')).toContainText('2012-08-25')
    await expect(timeBar.getByRole('button', { name: 'Play' })).toBeVisible()
    await expect.poll(() => hash(page)).toBe('#orrery?t=2012-08-25T00:00:00Z&focus=naif:-31')

    const before = await historyLength(page)
    await timeBar.getByRole('slider').focus()
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => hash(page)).toBe('#orrery?t=2012-08-26T00:00:00Z&focus=naif:-31')
    expect(await historyLength(page)).toBe(before)
  })

  test('a name works as a focus, with or without a time', async ({ page }) => {
    await open(page, '#orrery?focus=voyager-1')
    await expect(page.getByRole('complementary', { name: 'Voyager 1' })).toBeVisible()
    await expect.poll(() => hash(page)).toBe('#orrery?focus=naif:-31')

    await page.goto('about:blank')
    await open(page, '#orrery?t=2012-08-25&focus=voyager-1')
    await expect(canvas(page)).toHaveAttribute('data-orrery-focus', 'naif:-31')
    await expect.poll(() => hash(page)).toBe('#orrery?t=2012-08-25T00:00:00Z&focus=naif:-31')
  })

  test('a preset link opens that view; choosing a body swaps it for a focus', async ({ page }) => {
    await open(page, '#orrery?preset=outer')
    await expect(page.getByRole('button', { name: 'Outer', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect.poll(() => hash(page)).toBe('#orrery?preset=outer')

    const before = await historyLength(page)
    await page.getByRole('combobox', { name: /find/i }).fill('mars')
    await page.getByRole('option', { name: 'Mars' }).click()
    await expect.poll(() => hash(page)).toBe('#orrery?focus=Mars')
    expect(await historyLength(page)).toBe(before)
  })

  test('a preset chosen with something selected keeps both, and the link reopens both', async ({
    page,
  }) => {
    await open(page, '#orrery?focus=Mars')
    await expect(page.getByRole('complementary', { name: 'Mars' })).toBeVisible()
    await page.getByRole('button', { name: 'Inner', exact: true }).click()
    await expect.poll(() => hash(page)).toBe('#orrery?focus=Mars&preset=inner')

    await page.goto('about:blank')
    await open(page, '#orrery?focus=Mars&preset=inner')
    await expect(page.getByRole('complementary', { name: 'Mars' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Inner', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect.poll(() => hash(page)).toBe('#orrery?focus=Mars&preset=inner')
  })

  test('an address edited by hand is followed', async ({ page }) => {
    await open(page, '#orrery')
    await page.evaluate(() => {
      window.location.hash = '#orrery?focus=Jupiter'
    })
    await expect(page.getByRole('complementary', { name: 'Jupiter' })).toBeVisible()
    await expect.poll(() => hash(page)).toBe('#orrery?focus=Jupiter')
  })

  test('a link waits out a failed bodies fetch, and the visitor can still move on', async ({
    page,
  }) => {
    await offlineSun(page)
    let tries = 0
    await page.route('**/api/orrery-bodies', (route) => {
      tries += 1
      return route.fulfill({ status: 503, contentType: 'application/json', body: '{}' })
    })
    const link = '#orrery?t=2012-08-25T00:00:00Z&focus=naif:-31'
    await page.goto(`/${link}`)
    await expect(page.locator('[data-orrery-mode]')).toHaveAttribute('data-orrery-mode', 'webgl', {
      timeout: 15_000,
    })
    // The first try and three retries, about 7 s of backoff: then the query has failed.
    await expect.poll(() => tries, { timeout: 20_000 }).toBe(4)
    await page.waitForTimeout(1000)
    expect(await hash(page)).toBe(link)

    await page.getByRole('button', { name: 'Outer', exact: true }).click()
    await expect.poll(() => hash(page)).toBe('#orrery?t=2012-08-25T00:00:00Z&preset=outer')
  })

  test('the Earth–Moon view round-trips', async ({ page }) => {
    await open(page, '#orrery?preset=earth')
    await expect(page.getByRole('button', { name: 'Earth–Moon', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect.poll(() => hash(page)).toBe('#orrery?preset=earth')
  })

  test('an unknown focus and Earth layers are dropped from the address', async ({ page }) => {
    await open(page, '#orrery?focus=Pluto&layers=iss,quakes')
    await expect.poll(() => hash(page), { timeout: 15_000 }).toBe('#orrery')
    await expect(page.getByRole('complementary')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Play' })).toHaveCount(0)
  })

  test("the Earth view's layer links still work, there and back", async ({ page }) => {
    await mockBodies(page)
    await page.goto('/#earth?layers=iss,quakes')
    await expect.poll(() => hash(page)).toBe('#earth?layers=iss,quakes')
    await page.getByRole('tab', { name: /ORRERY/ }).click()
    await expect.poll(() => hash(page)).toBe('#orrery')
    await page.getByRole('tab', { name: /EARTH/ }).click()
    await expect.poll(() => hash(page)).toBe('#earth?layers=iss,quakes')
  })
})
