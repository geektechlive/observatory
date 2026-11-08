/**
 * The orrery's guide (#159): a drawer of lessons whose "Show me" buttons apply a shareable
 * link (#108) through the same path a pasted address takes. Every lesson is opened in one
 * page, in the order the guide lists them, and each must show its own subject, not just
 * open an inspector: the Jupiter lesson, last, only passes if the Voyager lesson's 2012
 * clock was returned to now first, because the moons exist only within days of today.
 */
import { expect, type Page, test } from '@playwright/test'

import { lookupTrajectory } from './lookupPayload'
import { moonPayload } from './moonPayload'
import { serveNeo } from './neoPayload'
import { serveSats } from './satPayload'
import { offlineSun } from './swpc'
import { voyager1 } from './voyagerPayload'

const oumuamua = {
  id: 'sb:50788063',
  spkid: '50788063',
  name: '1I/ʻOumuamua (A/2017 U1)',
  designation: 'A/2017 U1',
  prefix: 'A',
  kind: 'asteroid',
  orbitClass: { code: 'HYA', name: 'Hyperbolic Asteroid' },
  neo: false,
  pha: false,
}

async function mockAll(page: Page) {
  await offlineSun(page)
  const payload = moonPayload()
  payload.bodies.push(voyager1() as never)
  await page.route('**/api/orrery-bodies', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'X-Data-Age': '3600' },
      body: JSON.stringify(payload),
    }),
  )
  await serveNeo(page)
  await serveSats(page)
  await page.route('**/api/lookup?*', (route) =>
    route.fulfill({
      json: {
        query: 'oumuamua',
        provider: 'jpl-sbdb',
        result: { type: 'object', object: oumuamua },
      },
    }),
  )
  await page.route('**/api/trajectory?*', (route) => {
    const url = new URL(route.request().url())
    return route.fulfill({
      json: lookupTrajectory(
        oumuamua,
        url.searchParams.get('start') ?? '',
        url.searchParams.get('end') ?? '',
        url.searchParams.get('step') ?? '1d',
      ),
    })
  })
}

async function openOrrery(page: Page) {
  await mockAll(page)
  await page.goto('/#orrery')
  await expect(page.locator('[data-orrery-mode]')).toHaveAttribute('data-orrery-mode', 'webgl', {
    timeout: 20_000,
  })
}

/** A `t=` parameter, not the tail of `preset=`. */
const HAS_TIME = /[?&]t=/
const canvas = (page: Page) => page.locator('canvas[data-orrery-webgl]')
const hash = (page: Page) => page.evaluate(() => window.location.hash)
const drawer = (page: Page) => page.getByRole('complementary', { name: 'Guide', exact: true })
const bar = (page: Page) => page.getByRole('complementary', { name: 'Lesson on show' })
const guideButton = (page: Page) => page.getByRole('button', { name: 'Guide', exact: true })
const preset = (page: Page, name: string) => page.getByRole('button', { name, exact: true }).first()

async function openGuide(page: Page) {
  await guideButton(page).click()
  await expect(drawer(page)).toBeVisible()
}

async function showLesson(page: Page, id: string) {
  await page.locator(`button[data-lesson="${id}"]`).click()
  await expect(bar(page)).toBeVisible()
}

async function backToGuide(page: Page) {
  await bar(page).getByRole('button', { name: 'Back to guide' }).click()
  await expect(drawer(page)).toBeVisible()
}

test.describe('The guide (#159)', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('every lesson shows its own subject, and the drawer comes back each time', async ({
    page,
  }) => {
    await openOrrery(page)
    await openGuide(page)
    await expect(page.locator('button[data-lesson]')).toHaveCount(7)

    // 1. Voyager 1 at the heliopause: paused on the day, craft focused.
    await showLesson(page, 'voyager-1')
    // With a preset too, the camera sits on the preset and the inspector is on the craft.
    await expect(canvas(page)).toHaveAttribute('data-orrery-focus', 'heliosphere')
    await expect(page.getByRole('complementary', { name: 'Voyager 1' })).toBeVisible()
    await expect.poll(() => hash(page)).toContain('t=2012-08-25T00:00:00Z')
    await expect(preset(page, 'Heliosphere')).toHaveAttribute('aria-pressed', 'true')
    // The drawer collapsed to a bar and the inspector opened below it, not under it.
    await expect(drawer(page)).toBeHidden()
    const barBox = await bar(page).boundingBox()
    const inspectorBox = await page.getByRole('complementary', { name: 'Voyager 1' }).boundingBox()
    expect((inspectorBox?.y ?? 0) >= (barBox?.y ?? 0) + (barBox?.height ?? 0)).toBe(true)

    // 2. L1: back to now (no date in the link), the Earth frame opened on the marker.
    await backToGuide(page)
    await showLesson(page, 'l1')
    await expect(canvas(page)).toHaveAttribute('data-orrery-focus', 'earth')
    await expect(page.getByRole('complementary', { name: 'L1', exact: true })).toBeVisible()
    await expect(preset(page, 'Earth–Moon')).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => hash(page)).not.toMatch(HAS_TIME)
    await expect
      .poll(async () => Number((await canvas(page).getAttribute('data-orrery-earth-frame')) ?? 0))
      .toBeGreaterThan(0)

    // 3. The closest asteroid pass in the data: TA1 here, at the moment of the pass.
    await backToGuide(page)
    await showLesson(page, 'closest-asteroid')
    await expect(canvas(page)).toHaveAttribute('data-orrery-focus', 'earth')
    await expect(page.getByRole('complementary', { name: /2026 TA1/ })).toBeVisible()
    await expect(preset(page, 'Earth–Moon')).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => hash(page)).toContain('focus=sb:2026%20TA1')
    await expect.poll(() => hash(page)).toMatch(HAS_TIME)

    // 4. Mars: opposition day, Inner view.
    await backToGuide(page)
    await showLesson(page, 'mars-retrograde')
    await expect(canvas(page)).toHaveAttribute('data-orrery-focus', 'inner')
    await expect(page.getByRole('complementary', { name: 'Mars', exact: true })).toBeVisible()
    await expect(preset(page, 'Inner')).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => hash(page)).toContain('t=2025-01-16T00:00:00Z')

    // 5. The geostationary ring: a preset with no focus clears the inspector, and the
    // satellites are drawn at full strength.
    await backToGuide(page)
    await showLesson(page, 'geostationary')
    await expect(preset(page, 'Earth orbit')).toHaveAttribute('aria-pressed', 'true')
    await expect(canvas(page)).toHaveAttribute('data-orrery-focus', 'orbit')
    await expect(page.locator('aside[aria-labelledby]:not([data-guide-drawer])')).toHaveCount(0)
    await expect(canvas(page)).toHaveAttribute('data-orrery-sat-mode', 'points', {
      timeout: 20_000,
    })

    // 6. 'Oumuamua: fetched from JPL on demand, then focused on its perihelion day.
    await backToGuide(page)
    await showLesson(page, 'oumuamua')
    await expect(canvas(page)).toHaveAttribute('data-orrery-focus', 'lookup:50788063', {
      timeout: 20_000,
    })
    await expect(page.getByRole('complementary', { name: oumuamua.name })).toBeVisible()
    await expect.poll(() => hash(page)).toContain('t=2017-09-09T12:00:00Z')

    // 7. Jupiter's moons: only drawn if the clock really went back to now.
    await backToGuide(page)
    await showLesson(page, 'jupiter-moons')
    await expect(canvas(page)).toHaveAttribute('data-orrery-focus', 'Jupiter')
    await expect
      .poll(async () =>
        ((await canvas(page).getAttribute('data-orrery-moons')) ?? '').split(',').sort(),
      )
      .toEqual(['Callisto', 'Europa', 'Ganymede', 'Io'])
    await expect(page.locator('[data-orrery-nodata]')).toHaveCount(0)
    await expect.poll(() => hash(page)).not.toMatch(HAS_TIME)
  })

  test('Show me works again after the camera has moved', async ({ page }) => {
    await openOrrery(page)
    await openGuide(page)
    await showLesson(page, 'jupiter-moons')
    const moons = async () =>
      ((await canvas(page).getAttribute('data-orrery-moons')) ?? '').split(',').filter(Boolean)
    await expect.poll(moons).toHaveLength(4)

    // Zoom far out: the moons are hidden when the planet is a dot.
    await backToGuide(page)
    await page.getByRole('button', { name: 'Outer', exact: true }).click()
    await expect.poll(moons).toHaveLength(0)

    // The address still says "focus=Jupiter", so a hash edit would not fire; Show me must.
    await showLesson(page, 'jupiter-moons')
    await expect.poll(moons).toHaveLength(4)
  })

  test('Esc closes the guide and returns focus to the Guide button', async ({ page }) => {
    await openOrrery(page)
    await openGuide(page)
    await expect(page.getByRole('heading', { name: 'Guide', level: 2 })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(drawer(page)).toHaveCount(0)
    await expect(guideButton(page)).toBeFocused()
  })

  test('Esc in the Find box only dismisses its suggestions', async ({ page }) => {
    await openOrrery(page)
    await openGuide(page)
    const find = page.getByRole('combobox', { name: /find/i })
    await find.fill('mar')
    await expect(page.getByRole('listbox')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('listbox')).toHaveCount(0)
    await expect(drawer(page)).toBeVisible()
  })

  test('a lesson’s tip opens over the inspector without moving the bar', async ({ page }) => {
    await openOrrery(page)
    await openGuide(page)
    await showLesson(page, 'l1')
    const before = await bar(page).boundingBox()
    await bar(page).getByText('What to look for').click()
    const tip = bar(page).locator('p').last()
    await expect(tip).toBeVisible()
    const after = await bar(page).boundingBox()
    expect(after?.height).toBe(before?.height)
    // The bar still ends above the inspector.
    const inspector = await page
      .getByRole('complementary', { name: 'L1', exact: true })
      .boundingBox()
    expect((inspector?.y ?? 0) >= (after?.y ?? 0) + (after?.height ?? 0)).toBe(true)
  })

  test('the reference sections open, and the glossary lists the terms', async ({ page }) => {
    await openOrrery(page)
    await openGuide(page)
    await drawer(page).getByText('Where the data comes from').click()
    await expect(drawer(page).getByRole('link', { name: 'JPL Horizons' })).toBeVisible()
    await drawer(page).getByText('Glossary', { exact: true }).click()
    await expect(drawer(page).getByText('Heliopause', { exact: true })).toBeVisible()
  })

  test('an inspector term defines itself when pressed', async ({ page }) => {
    await openOrrery(page)
    await page.goto('/#orrery?focus=naif:-31')
    const inspector = page.getByRole('complementary', { name: 'Voyager 1' })
    await inspector.getByRole('button', { name: 'Light time' }).click()
    await expect(inspector.getByRole('note')).toContainText('How long light')
  })
})

test.describe('The first-visit hint (#159)', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('shows once, never as a modal, and stays gone once dismissed', async ({ page }) => {
    await openOrrery(page)
    const chip = page.getByRole('note').filter({ hasText: 'New here?' })
    await expect(chip).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await chip.getByRole('button', { name: /dismiss/i }).click()
    await expect(chip).toHaveCount(0)

    await page.reload()
    await expect(page.locator('[data-orrery-mode]')).toHaveAttribute('data-orrery-mode', 'webgl', {
      timeout: 20_000,
    })
    await expect(chip).toHaveCount(0)
  })

  test('opening the guide from the chip also retires it', async ({ page }) => {
    await openOrrery(page)
    await page.getByRole('button', { name: 'Open the guide' }).click()
    await expect(drawer(page)).toBeVisible()
    await page.keyboard.press('Escape')
    await page.reload()
    await expect(page.locator('[data-orrery-mode]')).toHaveAttribute('data-orrery-mode', 'webgl', {
      timeout: 20_000,
    })
    await expect(page.getByRole('button', { name: 'Open the guide' })).toHaveCount(0)
  })

  test('still works when localStorage throws', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new DOMException('denied', 'SecurityError')
        },
      })
    })
    await openOrrery(page)
    await page.getByRole('button', { name: 'Open the guide' }).click()
    await expect(drawer(page)).toBeVisible()
  })
})

test.describe('The guide on a phone (#159)', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test('opens as a sheet with no sideways scroll, and a lesson collapses it to a bar', async ({
    page,
  }) => {
    await openOrrery(page)
    const noSideways = () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
    expect(await noSideways()).toBe(true)

    await page.getByRole('button', { name: 'Open the guide' }).click()
    await expect(drawer(page)).toBeVisible()
    expect(await noSideways()).toBe(true)
    const sheet = await drawer(page).boundingBox()
    expect((sheet?.x ?? -1) >= 0 && (sheet?.x ?? 0) + (sheet?.width ?? 999) <= 375).toBe(true)

    await showLesson(page, 'jupiter-moons')
    await expect(canvas(page)).toHaveAttribute('data-orrery-focus', 'Jupiter')
    expect(await noSideways()).toBe(true)
    const strip = await bar(page).boundingBox()
    expect((strip?.x ?? -1) >= 0 && (strip?.x ?? 0) + (strip?.width ?? 999) <= 375).toBe(true)
    await backToGuide(page)
    await drawer(page).getByRole('button', { name: 'Close' }).click()
    await expect(drawer(page)).toHaveCount(0)
  })
})
