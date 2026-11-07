/**
 * The full-page orrery (#91): its own tab between Earth and Sun, a WebGL view of the
 * planets, search into an inspector, a clock that moves them, and a page that fits
 * phones. Headless Chromium runs WebGL on SwiftShader, which is enough for the planets.
 */
import { expect, type Page, test } from '@playwright/test'

import { offlineSun } from './swpc'

test.beforeEach(async ({ page }) => {
  await offlineSun(page)
})

const stage = (page: Page) => page.locator('[data-orrery-mode]')

async function openOrrery(page: Page) {
  await page.goto('/#orrery')
  await expect(stage(page)).toHaveAttribute('data-orrery-mode', 'webgl', { timeout: 20_000 })
}

/** Where a body's label sits now, or null when it is hidden. */
async function labelAt(page: Page, name: string) {
  return page.evaluate((n) => {
    const node = [
      ...document.querySelectorAll<HTMLButtonElement>('[data-orrery-page] button'),
    ].find((b) => b.textContent === n && !b.hidden)
    return node ? { left: node.style.left, top: node.style.top } : null
  }, name)
}

/** The bodies the renderer drew inside the canvas on its last frame. */
async function onScreen(page: Page): Promise<string[]> {
  const attr = await page.locator('canvas[data-orrery-webgl]').getAttribute('data-orrery-onscreen')
  return (attr ?? '').split(',').filter(Boolean)
}

/** Each preset frames what its name says, on desktop and on a phone. */
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test.describe(`Orrery presets at ${String(viewport.width)} px (#91)`, () => {
    test.use({ viewport })

    test('Inner shows Mercury to Mars and no outer planet', async ({ page }) => {
      await openOrrery(page)
      await expect
        .poll(() => onScreen(page))
        .toEqual(expect.arrayContaining(['Sun', 'Mercury', 'Venus', 'Earth', 'Mars']))
      const seen = await onScreen(page)
      for (const outer of ['Jupiter', 'Saturn', 'Uranus', 'Neptune']) {
        expect(seen).not.toContain(outer)
      }
    })

    test('Outer and Heliosphere show Jupiter to Neptune', async ({ page }) => {
      await openOrrery(page)
      if (viewport.width < 900)
        await page.getByRole('button', { name: 'Controls', exact: true }).click()
      await page.getByRole('button', { name: 'Outer', exact: true }).click()
      await expect
        .poll(() => onScreen(page))
        .toEqual(expect.arrayContaining(['Jupiter', 'Saturn', 'Uranus', 'Neptune']))
      if (viewport.width < 900)
        await page.getByRole('button', { name: 'Controls', exact: true }).click()
      await page.getByRole('button', { name: 'Heliosphere', exact: true }).click()
      await expect
        .poll(() => page.locator('canvas[data-orrery-webgl]').getAttribute('data-orrery-focus'))
        .toBe('heliosphere')
      await expect.poll(() => onScreen(page)).toEqual(expect.arrayContaining(['Neptune']))
    })
  })
}

test.describe('Orrery (#91)', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('the voice line’s planet always has a label', async ({ page }) => {
    await openOrrery(page)
    const voice = (await page.locator('[data-orrery-page] p').first().textContent()) ?? ''
    const subject = /^(\w+) is the nearest planet/.exec(voice)?.[1]
    expect(subject).toBeTruthy()
    await expect.poll(() => labelAt(page, subject ?? '')).not.toBeNull()
  })

  test('a focused body sits clear of the inspector drawer', async ({ page }) => {
    await openOrrery(page)
    await page.getByRole('combobox', { name: /find/i }).fill('mars')
    await page.keyboard.press('Enter')
    const drawer = page.getByRole('complementary')
    await expect(drawer).toBeVisible()
    await page.waitForTimeout(1200) // the camera flight
    const drawerLeft = (await drawer.boundingBox())?.x ?? 0
    const stageBox = await stage(page).boundingBox()
    const mars = await labelAt(page, 'Mars')
    expect(mars).not.toBeNull()
    const marsX = (stageBox?.x ?? 0) + parseFloat(mars?.left ?? '0')
    expect(marsX).toBeLessThan(drawerLeft)
  })

  test('the tab sits between Earth and Sun and draws the planets in WebGL', async ({ page }) => {
    await page.goto('/')
    const tabs = page.getByRole('tab')
    await expect(tabs.nth(1)).toHaveAccessibleName(/ORRERY/)
    await tabs.nth(1).click()
    await expect.poll(() => page.url()).toContain('#orrery')
    await expect(stage(page)).toHaveAttribute('data-orrery-mode', 'webgl', { timeout: 20_000 })
    await expect(page.locator('canvas[data-orrery-webgl]')).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Earth', exact: true })).toBeVisible()
  })

  test('takes the page: no ticker or lens here, and the dial returns to Earth', async ({
    page,
  }) => {
    await openOrrery(page)
    await expect(page.getByRole('region', { name: 'Live event feed' })).toHaveCount(0)
    await expect(page.getByRole('region', { name: 'Instrument' })).toHaveCount(0)
    await page.getByRole('tab', { name: /EARTH/ }).click()
    await expect(page.getByRole('region', { name: 'Instrument' })).toBeVisible()
    await expect(page.getByRole('region', { name: 'Live event feed' })).toBeVisible()
  })

  test('search opens the inspector on the chosen planet', async ({ page }) => {
    await openOrrery(page)
    await page.getByRole('combobox', { name: /find/i }).fill('jup')
    await page.getByRole('option', { name: 'Jupiter' }).click()
    await expect(page.getByRole('heading', { name: 'Jupiter' })).toBeVisible()
    await expect(page.getByText(/Kepler approximation/)).toBeVisible()
    await expect(stage(page).locator('canvas')).toHaveAttribute('data-orrery-focus', 'Jupiter')
  })

  test('moving the clock moves the planets', async ({ page }) => {
    await openOrrery(page)
    await page.getByRole('button', { name: 'Pause' }).click()
    await expect.poll(() => labelAt(page, 'Mercury')).not.toBeNull()
    const before = await labelAt(page, 'Mercury')
    const date = page.getByRole('textbox', { name: /go to date/i })
    await date.fill('2027-01-20')
    await date.press('Enter')
    await expect.poll(() => labelAt(page, 'Mercury')).not.toEqual(before)
    await expect(page.locator('output')).toContainText('2027-01-20')
  })

  test('a date outside 1800–2050 says it uses the long-window table', async ({ page }) => {
    await openOrrery(page)
    const date = page.getByRole('textbox', { name: /go to date/i })
    await date.fill('-500-03-15')
    await date.press('Enter')
    await expect(page.getByRole('status').filter({ hasText: 'Outside 1800' })).toContainText(
      'Table 2',
    )
    // Jumping to a date lands on that date, not a moment before it.
    await expect(page.locator('output')).toContainText('-0500-03-15 00:00')
  })
})

for (const width of [375, 700]) {
  test.describe(`Orrery on a ${String(width)} px screen (#91)`, () => {
    test.use({ viewport: { width, height: 844 } })

    test('fits the screen, the dial and the time bar both in view', async ({ page }) => {
      await openOrrery(page)
      const overflowing = await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      )
      expect(overflowing).toBe(false)
      await expect(page.getByRole('tablist', { name: 'Observatory console' })).toBeInViewport()
      for (const tab of await page.getByRole('tab').all()) await expect(tab).toBeInViewport()
      await expect(page.getByRole('button', { name: 'Now', exact: true })).toBeInViewport()
    })

    test('the controls open as a sheet', async ({ page }) => {
      await openOrrery(page)
      const toggle = page.getByRole('button', { name: 'Controls' })
      await toggle.click()
      await expect(page.getByRole('switch', { name: 'Orbits' })).toBeVisible()
    })
  })
}
