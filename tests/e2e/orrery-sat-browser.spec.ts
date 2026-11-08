/**
 * The satellite browser (#158), on the mocked satellites (satPayload.ts) and Space-Track
 * (spaceTrackPayload.ts): find a satellite that is not a station without knowing its name,
 * a switched-off group offers its switch, Space-Track's lists load on request, a link to a
 * satellite opens it (or drops gracefully), and nothing scrolls sideways at 375 px.
 */
import { expect, type Page, test } from '@playwright/test'

import { serveMoons } from './moonPayload'
import { serveNeo } from './neoPayload'
import { serveSats } from './satPayload'
import { serveSpaceTrack } from './spaceTrackPayload'
import { offlineSun } from './swpc'

test.beforeEach(async ({ page }) => {
  await offlineSun(page)
})

async function openOrrery(page: Page, hash = '#orrery') {
  await serveMoons(page)
  await serveNeo(page)
  await serveSpaceTrack(page)
  const requested = await serveSats(page)
  await page.goto(`/${hash}`)
  await expect(page.locator('[data-orrery-mode]')).toHaveAttribute('data-orrery-mode', 'webgl', {
    timeout: 20_000,
  })
  return requested
}

const canvas = (page: Page) => page.locator('canvas[data-orrery-webgl]')
const browseBy = (page: Page) => page.getByRole('combobox', { name: 'Browse by' })
const openBrowser = (page: Page) => page.getByRole('button', { name: 'Browse satellites' }).click()

test.describe('satellite browser (#158)', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('opens the Earth orbit view from the panel, then finds a non-station by its orbit', async ({
    page,
  }) => {
    await openOrrery(page)
    await openBrowser(page)
    // Far from Earth nothing is loaded: the panel says so and offers the view.
    await page.getByRole('button', { name: 'Open the Earth orbit view' }).click()
    await expect(canvas(page)).toHaveAttribute('data-orrery-focus', 'orbit')
    await browseBy(page).selectOption('orbit')
    await page.getByRole('combobox', { name: 'Orbit' }).selectOption('geo')
    const goes = page.getByRole('button', { name: /GOES-2/ })
    await expect(goes).toBeVisible()
    await goes.click()
    const inspector = page.getByRole('complementary')
    await expect(inspector.getByRole('heading', { name: 'GOES-2' })).toBeVisible()
    await expect(inspector.getByText('NORAD 41001')).toBeVisible()
  })

  test('filters by name and by NORAD number', async ({ page }) => {
    await openOrrery(page)
    await page.getByRole('button', { name: 'Earth orbit', exact: true }).click()
    await openBrowser(page)
    const search = page.getByRole('searchbox')
    await expect(page.getByRole('button', { name: /GPS BIIF-3/ })).toBeVisible()
    await search.fill('biif-3')
    await expect(page.getByRole('button', { name: /GPS BIIF-3/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /GOES/ })).toHaveCount(0)
    await search.fill('41003')
    await expect(page.getByRole('button', { name: /GOES-4/ })).toBeVisible()
  })

  test('counts what it lists, and names the groups that are off', async ({ page }) => {
    await openOrrery(page)
    await page.getByRole('button', { name: 'Earth orbit', exact: true }).click()
    await expect.poll(() => canvas(page).getAttribute('data-orrery-sat-drawn')).toBe('55')
    await openBrowser(page)
    // The mock has 55 objects in the default groups, under the 100-row cap (the cap and its
    // "N more" line are unit-tested over a larger field).
    await expect(page.getByText('55 matches.')).toBeVisible()
    const off = page.getByRole('group', { name: 'Switched off' })
    await expect(off.getByRole('button', { name: /Turn on Starlink/ })).toBeVisible()
    await expect(off.getByRole('button', { name: /Turn on Debris/ })).toBeVisible()
  })

  test('a group that is off offers its switch with the download size; choosing a row turns it on', async ({
    page,
  }) => {
    const requested = await openOrrery(page)
    await page.getByRole('button', { name: 'Earth orbit', exact: true }).click()
    await expect.poll(() => canvas(page).getAttribute('data-orrery-sat-drawn')).toBe('55')
    expect(requested).not.toContain('starlink')
    await openBrowser(page)
    await browseBy(page).selectOption('kind')
    await page.getByRole('combobox', { name: 'Kind' }).selectOption('starlink')
    await expect(page.getByText('Starlink is switched off')).toBeVisible()
    await page.getByRole('button', { name: /Turn on Starlink \(about 0\.5 MB\)/ }).click()
    await expect.poll(() => requested).toContain('starlink')
    const row = page.getByRole('button', { name: /STARLINK-7/ })
    await expect(row).toBeVisible()
    await row.click()
    await expect(page.getByRole('switch', { name: 'Starlink' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await expect(
      page.getByRole('complementary').getByRole('heading', { name: 'STARLINK-7' }),
    ).toBeVisible()
  })

  test('the Space-Track lists wait for a tap, then sort by radar size and filter by owner', async ({
    page,
  }) => {
    await openOrrery(page)
    await page.getByRole('button', { name: 'Earth orbit', exact: true }).click()
    await expect.poll(() => canvas(page).getAttribute('data-orrery-sat-drawn')).toBe('55')
    await openBrowser(page)
    await browseBy(page).selectOption('radar')
    await expect(page.getByRole('button', { name: /^ISS|^CSS/ })).toHaveCount(0)
    await page.getByRole('button', { name: /Load Space-Track/ }).click()
    // Large first (the ISS and Tiangong), then the medium GOES-2.
    const rows = page.getByRole('listitem')
    await expect(rows.first()).toContainText(/CSS|ISS/)
    await expect(rows).toHaveCount(3)
    await browseBy(page).selectOption('owner')
    await page.getByRole('combobox', { name: 'Owner' }).selectOption('PRC')
    await expect(page.getByRole('button', { name: /CSS \(TIANHE\)/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /ISS \(ZARYA\)/ })).toHaveCount(0)
  })

  test('lists the predicted re-entry first, and chooses it', async ({ page }) => {
    await openOrrery(page)
    await page.getByRole('button', { name: 'Earth orbit', exact: true }).click()
    await expect.poll(() => canvas(page).getAttribute('data-orrery-sat-drawn')).toBe('55')
    await openBrowser(page)
    await browseBy(page).selectOption('reentry')
    const tiangong = page.getByRole('button', { name: /CSS \(TIANHE\)/ })
    await expect(tiangong).toBeVisible()
    await expect(tiangong).toContainText('down ')
    await tiangong.click()
    await expect(
      page.getByRole('complementary').getByRole('heading', { name: 'CSS (TIANHE)' }),
    ).toBeVisible()
  })
})

test.describe('a link to a satellite (#158)', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('opens a satellite in a group that starts on', async ({ page }) => {
    await openOrrery(page, '#orrery?focus=sat:41002')
    await expect(
      page.getByRole('complementary').getByRole('heading', { name: 'GOES-3' }),
    ).toBeVisible({ timeout: 15_000 })
    expect(new URL(page.url()).hash).toContain('focus=sat:41002')
  })

  test('switches on the groups that start off to find a Starlink', async ({ page }) => {
    const requested = await openOrrery(page, '#orrery?focus=sat:44004')
    await expect(
      page.getByRole('complementary').getByRole('heading', { name: 'STARLINK-5' }),
    ).toBeVisible({ timeout: 15_000 })
    expect(requested).toContain('starlink')
  })

  test('drops an unknown satellite once the groups have settled', async ({ page }) => {
    const requested = await openOrrery(page, '#orrery?focus=sat:99999999')
    // It widened to every group before giving up.
    await expect.poll(() => requested.includes('starlink')).toBe(true)
    await expect.poll(() => new URL(page.url()).hash).not.toContain('focus=')
    await expect(page.getByRole('complementary')).toHaveCount(0)
  })
})

test.describe('on a phone (#158)', () => {
  test.use({ viewport: { width: 375, height: 760 } })

  test('the browser fits 375 px with nothing scrolling sideways', async ({ page }) => {
    await openOrrery(page)
    // The view buttons are in the controls sheet, which closes once one is chosen.
    const controls = page.getByRole('button', { name: 'Controls', exact: true })
    await controls.click()
    await page.getByRole('button', { name: 'Earth orbit', exact: true }).click()
    await controls.click()
    await openBrowser(page)
    await expect(page.getByRole('button', { name: /GOES-2/ }).first()).toBeVisible({
      timeout: 15_000,
    })
    const overflow = await page.evaluate(() => {
      const wide = [...document.querySelectorAll<HTMLElement>('[data-sat-browser] *')].filter(
        (el) => el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === 'visible',
      )
      return {
        page: document.documentElement.scrollWidth - window.innerWidth,
        wide: wide.map((el) => el.tagName),
      }
    })
    expect(overflow.page).toBeLessThanOrEqual(0)
    expect(overflow.wide).toEqual([])
    // Choosing a row closes the sheet and opens the inspector.
    await page
      .getByRole('button', { name: /GOES-2/ })
      .first()
      .click()
    await expect(
      page.getByRole('complementary').getByRole('heading', { name: 'GOES-2' }),
    ).toBeVisible()
  })
})
