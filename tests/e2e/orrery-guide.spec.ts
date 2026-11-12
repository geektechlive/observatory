/**
 * The orrery's guide (#159): a drawer of lessons whose "Show me" buttons apply a shareable
 * link (#108) through the same path a pasted address takes. Every lesson is opened in one
 * page, in the order the guide lists them, and each must show its own subject, not just
 * open an inspector: the Jupiter lesson, last, only passes if the Voyager lesson's 2012
 * clock was returned to now first, because the moons exist only within days of today.
 */
import { expect, type Page, test } from '@playwright/test'

import { moonPayload } from './moonPayload'
import { serveNeo } from './neoPayload'
import { serveSats } from './satPayload'
import { OUMUAMUA_ID, serveSmallBodies } from './smallBodiesPayload'
import { offlineSun } from './swpc'
import { voyager1 } from './voyagerPayload'

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
  // The 'Oumuamua lesson opens it from the comet data (#99), loaded on demand.
  await serveSmallBodies(page, { withOumuamua: true })
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

    // 6. 'Oumuamua: the comet data loads on demand, its switch comes on, and it is focused
    // on its perihelion day, drawn once (#99).
    await backToGuide(page)
    await showLesson(page, 'oumuamua')
    await expect(canvas(page)).toHaveAttribute('data-orrery-focus', OUMUAMUA_ID, {
      timeout: 20_000,
    })
    await expect(page.getByRole('complementary', { name: '1I/ʻOumuamua' })).toBeVisible()
    await expect(page.getByRole('switch', { name: 'Interstellar objects' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await expect(canvas(page)).toHaveAttribute('data-orrery-lookup', '')
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

  test('a lesson’s Play at button plays at the speed its tip asks for (#163)', async ({ page }) => {
    await openOrrery(page)
    await openGuide(page)
    await showLesson(page, 'voyager-1')
    const rate = page.getByRole('group', { name: 'Playback rate' })
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
    await bar(page).getByRole('button', { name: 'Play at 1 day/s' }).click()
    await expect(rate.getByRole('button', { name: '1 day/s' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.getByRole('button', { name: 'Pause', exact: true })).toBeVisible()
    // The address keeps the lesson's link: no rate is written into it.
    expect(await hash(page)).not.toMatch(/rate=/)
    // A lesson with no rate in its tip offers no button.
    await backToGuide(page)
    await showLesson(page, 'l1')
    await expect(bar(page).getByRole('button', { name: /^Play at/ })).toHaveCount(0)
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

  test('a lesson’s tip and the inspector stack: the Light time row stays visible', async ({
    page,
  }) => {
    await openOrrery(page)
    await openGuide(page)
    await showLesson(page, 'voyager-1')
    await bar(page).getByText('What to look for').click()
    const tip = bar(page).locator('p').last()
    await expect(tip).toBeVisible()
    const inspector = page.getByRole('complementary', { name: 'Voyager 1' })
    const row = inspector.getByRole('button', { name: 'Light time' })
    await expect(row).toBeVisible()
    const tipBox = await tip.boundingBox()
    const inspectorBox = await inspector.boundingBox()
    const rowBox = await row.boundingBox()
    const barBox = await bar(page).boundingBox()
    const disjoint = (a: typeof tipBox, b: typeof tipBox) =>
      !a || !b || a.y + a.height <= b.y || b.y + b.height <= a.y
    expect(disjoint(barBox, inspectorBox)).toBe(true)
    expect(disjoint(tipBox, rowBox)).toBe(true)
    // The row is inside the inspector's visible area, not scrolled out of it.
    expect(
      (rowBox?.y ?? 0) + (rowBox?.height ?? 0) <=
        (inspectorBox?.y ?? 0) + (inspectorBox?.height ?? 0),
    ).toBe(true)
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

const timeBar = (page: Page) => page.getByRole('group', { name: 'Simulation time' })

type Box = { x: number; y: number; width: number; height: number } | null

/** No shared area; a missing box counts as overlapping, so a vanished element can't pass. */
function boxesApart(a: Box, b: Box): boolean {
  if (!a || !b) return false
  return (
    a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y
  )
}

test.describe('The first-visit hint by touch (#185)', () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true })

  test('gives the touch gestures and fits the phone, clear of the controls', async ({ page }) => {
    await openOrrery(page)
    const chip = page.getByRole('note').filter({ hasText: 'New here?' })
    await expect(chip).toContainText('Two fingers slide')
    const box = await chip.boundingBox()
    expect((box?.x ?? -1) >= 0 && (box?.x ?? 0) + (box?.width ?? 999) <= 375).toBe(true)
    expect(boxesApart(box, await timeBar(page).boundingBox())).toBe(true)
    const controls = page.getByRole('button', { name: 'Controls' })
    expect(boxesApart(box, await controls.boundingBox())).toBe(true)
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

  test('says how to move the view, clear of the time bar (#185)', async ({ page }) => {
    await openOrrery(page)
    const chip = page.getByRole('note').filter({ hasText: 'New here?' })
    await expect(chip).toContainText('Right-drag to slide')
    expect(boxesApart(await chip.boundingBox(), await timeBar(page).boundingBox())).toBe(true)
  })

  test('the subtitle still says how to slide once the chip is gone (#185)', async ({ page }) => {
    await openOrrery(page)
    await page.getByRole('button', { name: /dismiss/i }).click()
    await expect(page.getByText('right-drag or two fingers to slide')).toBeVisible()
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

  test('the Voyager lesson keeps the craft, the tip and the inspector heading in the clear', async ({
    page,
  }) => {
    await openOrrery(page)
    await page.getByRole('button', { name: 'Open the guide' }).click()
    await showLesson(page, 'voyager-1')
    const inspector = page.getByRole('complementary', { name: 'Voyager 1' })
    const heading = inspector.getByRole('heading', { name: 'Voyager 1' })
    const label = page.locator('button[data-kind="craft"]', { hasText: 'Voyager 1' })
    const apart = (
      a: { y: number; height: number } | null,
      b: { y: number; height: number } | null,
    ) => !a || !b || a.y + a.height <= b.y + 4 || b.y + b.height <= a.y + 4

    await expect(canvas(page)).toHaveAttribute('data-orrery-animating', 'false', {
      timeout: 15_000,
    })
    // Tip closed: the craft's label sits between the bar and the inspector sheet.
    await expect(label).toBeVisible()
    // The refit after the bar's height arrives is a short flight that moves the label: judge
    // fresh boxes while the camera is still, never one read from before it (#182).
    await expect
      .poll(
        async () => {
          const still = (await canvas(page).getAttribute('data-orrery-animating')) === 'false'
          const labelBox = await label.boundingBox()
          return (
            still &&
            apart(labelBox, await bar(page).boundingBox()) &&
            apart(labelBox, await inspector.boundingBox())
          )
        },
        { timeout: 15_000 },
      )
      .toBe(true)

    // Tip open: it grows, and the sheet gives way so its heading is not under it.
    await bar(page).getByText('What to look for').click()
    await expect(bar(page).locator('p').last()).toBeVisible()
    const barOpen = await bar(page).boundingBox()
    const headingBox = await heading.boundingBox()
    expect(apart(barOpen, headingBox)).toBe(true)
    // Nothing reaches under the dial bar below the stage.
    const stage = await page.getByRole('region', { name: 'Orrery' }).boundingBox()
    const sheetOpen = await inspector.boundingBox()
    expect(
      (sheetOpen?.y ?? 0) + (sheetOpen?.height ?? 0) <= (stage?.y ?? 0) + (stage?.height ?? 0),
    ).toBe(true)
  })

  test('a lesson keeps the stage notices, under the bar and clear of the craft (#164)', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openOrrery(page)
    await page.getByRole('button', { name: 'Open the guide' }).click()
    await showLesson(page, 'voyager-1')
    // On 25 August 2012 the moons have no data: the stage says so during the lesson too.
    const notice = page.locator('[data-orrery-nodata]')
    await expect(notice).toBeVisible()
    await expect(notice).toContainText('no data for this date')
    // All of it is readable: nothing clipped, since the notices take no pointer to scroll.
    await expect(notice).toContainText('Positions are never extrapolated.')
    expect(await notice.evaluate((el) => el.scrollHeight <= el.clientHeight)).toBe(true)
    const inspector = page.getByRole('complementary', { name: 'Voyager 1' })
    const label = page.locator('button[data-kind="craft"]', { hasText: 'Voyager 1' })
    const apart = (
      a: { y: number; height: number } | null,
      b: { y: number; height: number } | null,
    ) => !a || !b || a.y + a.height <= b.y + 4 || b.y + b.height <= a.y + 4
    await expect(label).toBeVisible()
    // Judge fresh boxes once the camera is still: the refit after the notice arrives is a
    // short flight (#182).
    await expect
      .poll(
        async () => {
          const still = (await canvas(page).getAttribute('data-orrery-animating')) === 'false'
          const noticeBox = await notice.boundingBox()
          const labelBox = await label.boundingBox()
          return (
            still &&
            apart(noticeBox, await bar(page).boundingBox()) &&
            apart(noticeBox, await inspector.boundingBox()) &&
            apart(noticeBox, labelBox) &&
            apart(labelBox, await inspector.boundingBox())
          )
        },
        { timeout: 15_000 },
      )
      .toBe(true)
    // Under the bar, not on top of it, and inside the phone's width.
    const barBox = await bar(page).boundingBox()
    const noticeBox = await notice.boundingBox()
    expect((noticeBox?.y ?? 0) >= (barBox?.y ?? 0) + (barBox?.height ?? 0)).toBe(true)
    expect(
      (noticeBox?.x ?? -1) >= 0 && (noticeBox?.x ?? 0) + (noticeBox?.width ?? 999) <= 390,
    ).toBe(true)
  })

  test('opening the guide from the controls sheet closes the sheet (#165)', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openOrrery(page)
    await page.getByRole('button', { name: 'Controls' }).click()
    await expect(page.locator('#orrery-controls')).toHaveAttribute('data-open', 'true')
    await page
      .locator('#orrery-controls')
      .getByRole('button', { name: 'Guide', exact: true })
      .click()
    await expect(page.locator('#orrery-controls')).not.toHaveAttribute('data-open', 'true')
    await expect(page.getByRole('heading', { name: 'Guide', level: 2 })).toBeVisible()
  })
})
