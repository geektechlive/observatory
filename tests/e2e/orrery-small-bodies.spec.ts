/**
 * Comets and the interstellar objects in the orrery (#99). /api/orrery-smallbodies is
 * mocked (smallBodiesPayload.ts): nothing is fetched until a switch asks; the switches
 * draw each group with its line; choosing one opens its inspector with what the payload
 * carries; and a link to one switches its group on and opens it.
 */
import { expect, type Page, test } from '@playwright/test'

import { lookupTrajectory } from './lookupPayload'
import { serveMoons } from './moonPayload'
import { serveNeo } from './neoPayload'
import { ATLAS_ID, COMET_ID, serveCometsTonight, serveSmallBodies } from './smallBodiesPayload'
import { offlineSun } from './swpc'

test.use({ viewport: { width: 1440, height: 900 } })

const canvas = (page: Page) => page.locator('canvas[data-orrery-webgl]')
const attr = async (page: Page, name: string) => (await canvas(page).getAttribute(name)) ?? ''

async function open(page: Page, hash = '#orrery') {
  await offlineSun(page)
  await serveMoons(page)
  // A link waits for the close approaches to settle before it asks for small bodies.
  await serveNeo(page)
  const asked = await serveSmallBodies(page)
  await page.goto(`/${hash}`)
  await expect(page.locator('[data-orrery-mode]')).toHaveAttribute('data-orrery-mode', 'webgl', {
    timeout: 20_000,
  })
  return asked
}

test.describe('Bright asteroids (#99 item 4)', () => {
  test('the switch starts off, loads only the small Tonight slice, and draws the asteroid', async ({
    page,
  }) => {
    const tonight = await serveCometsTonight(page)
    const comets = await open(page)
    await page.waitForTimeout(1000)
    expect(tonight).toEqual([])
    const sw = page.getByRole('switch', { name: 'Bright asteroids' })
    await expect(sw).toHaveAttribute('aria-checked', 'false')
    await sw.click()
    await expect.poll(() => tonight.length).toBeGreaterThan(0)
    await expect.poll(() => attr(page, 'data-orrery-small-body-keys')).toBe('sbc:20000004')
    await expect(page.getByRole('status').filter({ hasText: /1 bright asteroid/ })).toBeVisible()
    // The comets' 72 kB payload is never asked for.
    expect(comets).toEqual([])
  })
})

test.describe('Comets & interstellar (#99)', () => {
  test('nothing loads until a switch asks; each switch draws its group with a line', async ({
    page,
  }) => {
    const asked = await open(page)
    await page.waitForTimeout(1000)
    expect(asked).toEqual([])
    await expect.poll(() => attr(page, 'data-orrery-small-bodies')).toBe('0')

    await page.getByRole('switch', { name: 'Comets' }).click()
    await expect.poll(() => asked.length).toBeGreaterThan(0)
    await expect.poll(() => attr(page, 'data-orrery-small-body-keys')).toBe(COMET_ID)
    await expect.poll(() => attr(page, 'data-orrery-small-body-paths')).toBe('1')
    await expect(
      page.getByRole('status').filter({ hasText: /1 comet and 1 interstellar/ }),
    ).toBeVisible()

    await page.getByRole('switch', { name: 'Interstellar objects' }).click()
    await expect.poll(() => attr(page, 'data-orrery-small-bodies')).toBe('2')
    await expect.poll(() => attr(page, 'data-orrery-small-body-paths')).toBe('2')

    // Markers stay under the Sun on screen (#195): the probe reports their radius.
    await canvas(page).evaluate((c) => {
      c.setAttribute('data-orrery-px', '')
    })
    await page.getByRole('button', { name: 'Inner', exact: true }).click()
    await expect
      .poll(async () => JSON.parse((await attr(page, 'data-orrery-px')) || '{}').smallBody ?? null)
      .not.toBeNull()
    const px = JSON.parse(await attr(page, 'data-orrery-px')) as { sun: number; smallBody: number }
    expect(px.smallBody).toBeLessThanOrEqual(5.01)
    expect(px.smallBody).toBeLessThan(px.sun)

    await page.getByRole('switch', { name: 'Comets' }).click()
    await expect.poll(() => attr(page, 'data-orrery-small-body-keys')).toBe(ATLAS_ID)
  })

  test('choosing 3I/ATLAS in the Find box opens its inspector', async ({ page }) => {
    await open(page)
    await page.getByRole('switch', { name: 'Interstellar objects' }).click()
    await page.getByRole('combobox', { name: /find/i }).fill('3I')
    await page.getByRole('option', { name: /^3I\/ATLAS/ }).click()
    await expect(canvas(page)).toHaveAttribute('data-orrery-focus', ATLAS_ID)
    const inspector = page.getByRole('complementary', { name: '3I/ATLAS' })
    await expect(inspector).toBeVisible()
    await expect(inspector).toContainText('Interstellar object')
    await expect(inspector).toContainText('hyperbolic')
    await expect(inspector).toContainText('Speed far from the Sun')
    await expect(inspector).toContainText('58.0')
    await expect(inspector).toContainText('2025-07-01')
    await expect(inspector).toContainText(/extrapolated from them/)
  })

  test('a JPL lookup of 3I/ATLAS is drawn once when the comet data draws it too', async ({
    page,
  }) => {
    const atlas = {
      id: 'sb:1004083',
      spkid: '1004083',
      name: '3I/ATLAS (C/2025 N1)',
      designation: 'C/2025 N1',
      prefix: 'C',
      kind: 'comet',
      orbitClass: { code: 'HYP', name: 'Hyperbolic Comet' },
      neo: false,
      pha: false,
    }
    await page.route('**/api/trajectory?*', (route) => {
      const url = new URL(route.request().url())
      return route.fulfill({
        json: lookupTrajectory(
          atlas,
          url.searchParams.get('start') ?? '',
          url.searchParams.get('end') ?? '',
          url.searchParams.get('step') ?? '1d',
        ),
      })
    })
    await open(page, '#orrery?focus=lookup:1004083')
    // Alone, the lookup draws its own marker.
    await expect
      .poll(() => attr(page, 'data-orrery-lookup'), { timeout: 15_000 })
      .toBe('lookup:1004083')
    await page.getByRole('switch', { name: 'Interstellar objects' }).click()
    await expect.poll(() => attr(page, 'data-orrery-small-body-keys')).toBe(ATLAS_ID)
    // Its twin in the comet data is drawn now, so the lookup's copy hides.
    await expect.poll(() => attr(page, 'data-orrery-lookup')).toBe('')
    await expect.poll(() => attr(page, 'data-orrery-lookup-path')).toBe('0')
    await expect(canvas(page)).toHaveAttribute('data-orrery-focus', 'lookup:1004083')
  })

  test('a link to a comet switches its group on and opens it', async ({ page }) => {
    const asked = await open(page, `#orrery?focus=${COMET_ID}`)
    await expect.poll(() => asked.length).toBeGreaterThan(0)
    await expect(page.getByRole('switch', { name: 'Comets' })).toHaveAttribute(
      'aria-checked',
      'true',
    )
    await expect(canvas(page)).toHaveAttribute('data-orrery-focus', COMET_ID)
    const inspector = page.getByRole('complementary', { name: 'C/2026 A2 (Bok)' })
    await expect(inspector).toBeVisible()
    await expect(inspector).toContainText('Comet')
    await expect(inspector).not.toContainText('Speed far from the Sun')
    await expect(inspector).toContainText(/drawn from its orbital elements/)
    await expect
      .poll(() => page.evaluate(() => window.location.hash))
      .toContain(`focus=${COMET_ID}`)
  })
})
