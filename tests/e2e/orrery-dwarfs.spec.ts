/**
 * The dwarf planets in the orrery (#99 item 8), from their own /api/orrery-dwarfs (mocked
 * in dwarfsPayload.ts): nothing loads until the "Dwarf planets" switch or a link asks, and
 * then not the comets; the Tonight panel's comets never bring them; Pluto is drawn at both
 * ends of the clock; outside 1600–2500 Ceres's marker hides, its orbit stays and the stage
 * says why; before the refresh job has written them the switch says so.
 */
import { expect, type Page, test } from '@playwright/test'

import { CERES_ID, PLUTO_ID, serveDwarfs } from './dwarfsPayload'
import { serveMoons } from './moonPayload'
import { serveNeo } from './neoPayload'
import { serveCometsTonight, serveSmallBodies } from './smallBodiesPayload'
import { offlineSun } from './swpc'

test.use({ viewport: { width: 1440, height: 900 } })

const canvas = (page: Page) => page.locator('canvas[data-orrery-webgl]')
const attr = async (page: Page, name: string) => (await canvas(page).getAttribute(name)) ?? ''

async function open(page: Page, hash = '#orrery') {
  await offlineSun(page)
  await serveMoons(page)
  await serveNeo(page)
  const comets = await serveSmallBodies(page)
  const asked = await serveDwarfs(page)
  await page.goto(`/${hash}`)
  await expect(page.locator('[data-orrery-mode]')).toHaveAttribute('data-orrery-mode', 'webgl', {
    timeout: 20_000,
  })
  return { asked, comets }
}

test.describe('Dwarf planets (#99 item 8)', () => {
  test('nothing loads until the switch asks; then Pluto and Ceres are drawn, under the Sun', async ({
    page,
  }) => {
    const { asked, comets } = await open(page)
    await page.waitForTimeout(1000)
    expect(asked).toEqual([])
    expect(comets).toEqual([])
    const sw = page.getByRole('switch', { name: 'Dwarf planets' })
    await expect(sw).toHaveAttribute('aria-checked', 'false')
    await sw.click()
    await expect.poll(() => asked.length).toBeGreaterThan(0)
    // The switch fetches the dwarf planets alone, never the comets' payload.
    expect(comets).toEqual([])
    await expect
      .poll(() => attr(page, 'data-orrery-small-body-keys'))
      .toBe(`${PLUTO_ID},${CERES_ID}`)
    await expect.poll(() => attr(page, 'data-orrery-small-body-paths')).toBe('2')
    await expect(page.getByRole('status').filter({ hasText: /2 dwarf planets/ })).toBeVisible()

    await canvas(page).evaluate((c) => {
      c.setAttribute('data-orrery-px', '')
    })
    await page.getByRole('button', { name: 'Outer', exact: true }).click()
    await expect
      .poll(async () => JSON.parse((await attr(page, 'data-orrery-px')) || '{}').dwarf ?? null)
      .not.toBeNull()
    const px = JSON.parse(await attr(page, 'data-orrery-px')) as { sun: number; dwarf: number }
    expect(px.dwarf).toBeLessThanOrEqual(6.01)
    expect(px.dwarf).toBeLessThan(px.sun)
  })

  test('at 2999 BC Pluto is still drawn; Ceres keeps its orbit and the stage says why', async ({
    page,
  }) => {
    await open(page, '#orrery?t=-002999-01-02')
    await page.getByRole('switch', { name: 'Dwarf planets' }).click()
    await expect.poll(() => attr(page, 'data-orrery-small-body-keys')).toBe(PLUTO_ID)
    // Both orbit lines: Ceres's stays where its marker is hidden.
    await expect.poll(() => attr(page, 'data-orrery-small-body-paths')).toBe('2')
    await expect(page.locator('[data-orrery-dwarf-notice]')).toHaveText(
      "Ceres is hidden: JPL's ephemeris for it covers about 1600 to 2500. Its orbit is still drawn.",
    )
  })

  test('a link to Pluto by name loads the data, switches the group on and opens it', async ({
    page,
  }) => {
    const { asked, comets } = await open(page, '#orrery?focus=pluto')
    await expect.poll(() => asked.length).toBeGreaterThan(0)
    await expect(page.getByRole('switch', { name: 'Dwarf planets' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await expect(canvas(page)).toHaveAttribute('data-orrery-focus', PLUTO_ID)
    const inspector = page.getByRole('complementary', { name: 'Pluto' })
    await expect(inspector).toContainText('Dwarf planet')
    await expect(inspector).toContainText('Pluto Barycenter (9)')
    expect(comets).toEqual([])
  })

  test('before the refresh job has written them, the switch says there is no data yet', async ({
    page,
  }) => {
    await offlineSun(page)
    await serveMoons(page)
    await serveNeo(page)
    // KV has no key yet: the endpoint's own 503 (functions/api/_kvBody.ts).
    await page.route('**/api/orrery-dwarfs', (route) =>
      route.fulfill({ status: 503, json: { error: 'Dwarf planets not yet in KV' } }),
    )
    await page.goto('/#orrery')
    await page.getByRole('switch', { name: 'Dwarf planets' }).click()
    await expect(
      page.getByRole('status').filter({ hasText: 'No dwarf-planet data yet' }),
    ).toBeVisible({ timeout: 20_000 })
    await expect.poll(() => attr(page, 'data-orrery-small-bodies')).toBe('0')
  })
})

test.describe('The Tonight panel (#99 item 8)', () => {
  test.use({ geolocation: { latitude: 31.96, longitude: -111.6 }, permissions: ['geolocation'] })

  test("fetches only its slice of tonight's comets: not the orrery's comets, nor the dwarf planets (#135)", async ({
    page,
  }) => {
    const tonight = await serveCometsTonight(page)
    const comets = await serveSmallBodies(page)
    const dwarfsAsked = await serveDwarfs(page)
    await page.goto('/#sky')
    await page.getByRole('button', { name: 'Use my location' }).first().click()
    await expect.poll(() => tonight.length, { timeout: 20_000 }).toBeGreaterThan(0)
    // The slice parsed: the list is no longer loading and did not fail.
    const list = page
      .locator('div')
      .filter({ has: page.getByText('Comets tonight') })
      .last()
    await expect(list).not.toContainText('Loading comets', { timeout: 10_000 })
    await expect(list).not.toContainText('unavailable')
    await page.waitForTimeout(1000)
    expect(comets).toEqual([])
    expect(dwarfsAsked).toEqual([])
  })
})
