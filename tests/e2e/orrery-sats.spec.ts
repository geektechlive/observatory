/**
 * Satellites in the orrery (#98), from a mocked /api/orrery-sats (satPayload.ts) and a
 * mocked Earth (moonPayload.ts): nothing is fetched until the Earth frame opens, the
 * Earth orbit view draws points, pulling back turns them to haze and then nothing, a
 * switch loads its group, and the ISS opens in the inspector from search.
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

async function openOrrery(page: Page) {
  await serveMoons(page)
  await serveNeo(page)
  const requested = await serveSats(page)
  await page.goto('/#orrery')
  await expect(page.locator('[data-orrery-mode]')).toHaveAttribute('data-orrery-mode', 'webgl', {
    timeout: 20_000,
  })
  return requested
}

const canvas = (page: Page) => page.locator('canvas[data-orrery-webgl]')
const attr = async (page: Page, name: string) => (await canvas(page).getAttribute(name)) ?? ''

test.describe('satellites (#98)', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('nothing is fetched far from Earth; the Earth orbit view draws them as points', async ({
    page,
  }) => {
    const requested = await openOrrery(page)
    // Heliosphere: the frame is closed, so no group is downloaded.
    await expect.poll(() => attr(page, 'data-orrery-sat-mode')).toBe('hidden')
    expect(requested).toEqual([])
    await page.getByRole('button', { name: 'Earth orbit', exact: true }).click()
    await expect(canvas(page)).toHaveAttribute('data-orrery-focus', 'orbit')
    await expect.poll(() => attr(page, 'data-orrery-sat-mode')).toBe('points')
    // The default switches: everything but Starlink and the debris.
    await expect
      .poll(() => attr(page, 'data-orrery-sat-groups'))
      .toBe('stations,gps-ops,weather,science,other')
    expect(requested).not.toContain('starlink')
    await expect.poll(async () => Number(await attr(page, 'data-orrery-sat-drawn'))).toBe(55)
    expect(Number(await attr(page, 'data-sat-propagate-ms'))).toBeGreaterThanOrEqual(0)
    await expect(page.getByText('55 satellites from CelesTrak', { exact: false })).toBeVisible()
  })

  test('pulling back turns the points to haze, and far out they are gone', async ({ page }) => {
    await openOrrery(page)
    await page.getByRole('button', { name: 'Earth orbit', exact: true }).click()
    await expect.poll(() => attr(page, 'data-orrery-sat-mode')).toBe('points')
    const box = await canvas(page).boundingBox()
    if (!box) throw new Error('no canvas')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    const pullBackUntil = async (mode: string) => {
      for (let i = 0; i < 30 && (await attr(page, 'data-orrery-sat-mode')) !== mode; i += 1) {
        await page.mouse.wheel(0, 250)
        await page.waitForTimeout(150)
      }
      await expect.poll(() => attr(page, 'data-orrery-sat-mode')).toBe(mode)
    }
    await pullBackUntil('haze')
    // Back to the whole solar system: the frame closes and they go.
    await page.getByRole('button', { name: 'Inner', exact: true }).click()
    await expect.poll(() => attr(page, 'data-orrery-sat-mode')).toBe('hidden')
  })

  test('a switch loads its group', async ({ page }) => {
    const requested = await openOrrery(page)
    await page.getByRole('button', { name: 'Earth orbit', exact: true }).click()
    await expect.poll(async () => Number(await attr(page, 'data-orrery-sat-drawn'))).toBe(55)
    const starlink = page.getByRole('switch', { name: 'Starlink' })
    await expect(starlink).toHaveAttribute('aria-describedby', /.+/)
    await starlink.click()
    await expect.poll(async () => Number(await attr(page, 'data-orrery-sat-drawn'))).toBe(85)
    expect(requested).toContain('starlink')
    await page.getByRole('switch', { name: 'Space stations' }).click()
    await expect.poll(async () => Number(await attr(page, 'data-orrery-sat-drawn'))).toBe(83)
  })

  test('the ISS opens in the inspector from search', async ({ page }) => {
    await openOrrery(page)
    await page.getByRole('combobox', { name: /find/i }).fill('ISS')
    await page.getByRole('option', { name: /^ISS/ }).first().click()
    await expect.poll(() => attr(page, 'data-orrery-sat-mode')).toBe('points')
    const inspector = page.getByRole('complementary')
    await expect(inspector.getByRole('heading', { name: 'ISS (ZARYA)' })).toBeVisible()
    await expect(inspector.getByText('NORAD 25544')).toBeVisible()
    await expect(inspector.getByText('Space stations')).toBeVisible()
    await expect(page.locator('button[data-kind="satellite"]')).toBeVisible()
  })

  test('the chosen satellite is ringed in screen px with every group on (#140)', async ({
    page,
  }) => {
    await openOrrery(page)
    await canvas(page).evaluate((c) => {
      c.setAttribute('data-orrery-px', '')
    })
    await page.getByRole('button', { name: 'Earth orbit', exact: true }).click()
    await expect.poll(async () => Number(await attr(page, 'data-orrery-sat-drawn'))).toBe(55)
    await page.getByRole('switch', { name: 'Starlink' }).click()
    await page.getByRole('switch', { name: 'Debris' }).click()
    await expect
      .poll(async () => Number(await attr(page, 'data-orrery-sat-drawn')))
      .toBeGreaterThan(55)
    await page.getByRole('combobox', { name: /find/i }).fill('ISS')
    await page.getByRole('option', { name: /^ISS/ }).first().click()
    const px = async () =>
      JSON.parse((await attr(page, 'data-orrery-px')) || '{}') as Record<string, number | null>
    await expect.poll(async () => (await px())['satSelect'] ?? 0).toBeGreaterThan(0)
    const drawn = await px()
    // Outside the marker, never as big as the Sun.
    expect(drawn['satSelect']).toBeGreaterThan(drawn['satMarker'] ?? 0)
    expect(drawn['satSelect']).toBeLessThan(drawn['sun'] ?? 0)
  })

  test('Space-Track and DISCOS add to the inspector, the controls and the stage (#101)', async ({
    page,
  }) => {
    await serveSpaceTrack(page)
    await openOrrery(page)
    await expect(page.getByText('Space-Track tracks 35,526 objects in orbit')).toBeVisible()
    await expect(
      page.getByText(/1 object is predicted to re-enter in the next 7 days/),
    ).toBeVisible()
    await page.getByRole('combobox', { name: /find/i }).fill('ISS')
    await page.getByRole('option', { name: /^ISS/ }).first().click()
    const inspector = page.getByRole('complementary')
    await expect(inspector.getByText('International Space Station partners (ISS)')).toBeVisible()
    await expect(inspector.getByText('Large on radar (over 1 m)')).toBeVisible()
    await expect(inspector.getByText('ESA DISCOS: International Space Station')).toBeVisible()
    // Tiangong (stations group, on by default) is predicted to come down: ringed.
    await expect.poll(async () => Number(await attr(page, 'data-orrery-sat-reentries'))).toBe(1)
  })
})
