/**
 * Views are paths (ADR 0036, #232): /orrery/, /sun/, /sky/ and /orbit/ each open their view,
 * an old `/#orrery?…` link is rewritten to the new form, the dial is a row of links, and the
 * tab title follows the view. /api/orrery-bodies is mocked with Voyager 1, like orrery-link.
 */
import { expect, type Page, test } from '@playwright/test'

import { offlineSun } from './swpc'
import { voyager1 } from './voyagerPayload'

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

const where = (page: Page) => page.evaluate(() => window.location.pathname + window.location.hash)
const orreryReady = (page: Page) =>
  expect(page.locator('[data-orrery-mode]')).toHaveAttribute('data-orrery-mode', 'webgl', {
    timeout: 15_000,
  })

test.describe('views are paths (ADR 0036)', () => {
  test('/orrery/ opens the orrery, titled for it', async ({ page }) => {
    await mockBodies(page)
    await page.goto('/orrery/')
    await orreryReady(page)
    await expect(page.getByRole('tab', { name: /ORRERY/ })).toHaveAttribute('aria-selected', 'true')
    await expect(page).toHaveTitle(/^Orrery: 3D solar system with live spacecraft/)
    expect(await where(page)).toBe('/orrery/')
  })

  test('an old /#orrery?focus=jupiter link lands on /orrery/#focus=Jupiter, Jupiter focused', async ({
    page,
  }) => {
    await mockBodies(page)
    await page.goto('/#orrery?focus=jupiter')
    await orreryReady(page)
    await expect.poll(() => where(page)).toMatch(/^\/orrery\/#focus=Jupiter$/)
    await expect(page.locator('canvas[data-orrery-webgl]')).toHaveAttribute(
      'data-orrery-focus',
      'Jupiter',
    )
  })

  test('an old #sun link opens the Sun at /sun/', async ({ page }) => {
    await page.goto('/#sun')
    await expect(page.getByRole('tab', { name: /SUN/ })).toHaveAttribute('aria-selected', 'true')
    expect(await where(page)).toBe('/sun/')
  })

  test('the dial is links to the five paths; a click navigates in the app and sets the title', async ({
    page,
  }) => {
    await page.goto('/')
    const tabs = page.getByRole('tab')
    await expect(tabs).toHaveCount(5)
    const hrefs = await tabs.evaluateAll((els) => els.map((el) => el.getAttribute('href')))
    expect(hrefs).toEqual(['/', '/orrery/', '/sun/', '/sky/', '/orbit/'])

    let loads = 0
    page.on('load', () => {
      loads += 1
    })
    await page.getByRole('tab', { name: /SUN/ }).click()
    await expect.poll(() => where(page)).toBe('/sun/')
    await expect(page).toHaveTitle(/^Sun: live space weather/)
    await page.getByRole('tab', { name: /SKY/ }).click()
    await expect.poll(() => where(page)).toBe('/sky/')
    await expect(page).toHaveTitle(/^Sky: tonight/)
    expect(loads).toBe(0)
  })

  test('the header subtitle follows the view', async ({ page }) => {
    await page.goto('/')
    const subtitle = page.getByRole('banner').getByText('Earth watch, live NASA and NOAA feeds')
    await expect(subtitle).toBeVisible()
    await page.getByRole('tab', { name: /SUN/ }).click()
    await expect(
      page.getByRole('banner').getByText('The Sun today, live from NASA and NOAA'),
    ).toBeVisible()
  })

  test('the back button returns to the previous view', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('tab', { name: /SUN/ }).click()
    await expect.poll(() => where(page)).toBe('/sun/')
    await page.getByRole('tab', { name: /ORBIT/ }).click()
    await expect.poll(() => where(page)).toMatch(/^\/orbit\//)
    await page.goBack()
    await expect.poll(() => where(page)).toBe('/sun/')
    await expect(page.getByRole('tab', { name: /SUN/ })).toHaveAttribute('aria-selected', 'true')
    await page.goBack()
    await expect(page.getByRole('tab', { name: /EARTH/ })).toHaveAttribute('aria-selected', 'true')
    await expect(page).toHaveTitle(/^Observatory: live ISS tracker/)
  })

  test('the arrow keys move between views, one history entry each', async ({ page }) => {
    await page.goto('/')
    const before = await page.evaluate(() => window.history.length)
    await page.getByRole('tab', { name: /EARTH/ }).focus()
    await page.keyboard.press('ArrowRight')
    await expect.poll(() => where(page)).toMatch(/^\/orrery\//)
    expect(await page.evaluate(() => window.history.length)).toBe(before + 1)
  })

  test('a modified click is left to the browser: it opens a new tab', async ({ page, context }) => {
    await page.goto('/')
    const opened = context.waitForEvent('page')
    await page.getByRole('tab', { name: /SUN/ }).click({ modifiers: ['ControlOrMeta'] })
    const tab = await opened
    await expect.poll(() => tab.url()).toContain('/sun/')
    expect(await where(page)).toMatch(/^\/(#layers=.*)?$/)
  })
})

test.describe('each shell answers its own address', () => {
  for (const [path, title] of [
    ['/orrery/', /^Orrery:/],
    ['/sun/', /^Sun:/],
    ['/sky/', /^Sky:/],
    ['/orbit/', /^Orbit:/],
  ] as const) {
    test(`${path} has its own title and canonical in the served HTML`, async ({ request }) => {
      const res = await request.get(path)
      expect(res.status()).toBe(200)
      const html = await res.text()
      expect(/<title>([^<]*)<\/title>/.exec(html)?.[1]).toMatch(title)
      expect(html).toContain(
        `<link rel="canonical" href="https://observatory.geektechlive.com${path}" />`,
      )
      expect(html).toContain('<noscript>')
    })
  }

  test('robots.txt, sitemap.xml and llms.txt are served as themselves', async ({ request }) => {
    const robots = await request.get('/robots.txt')
    expect(robots.headers()['content-type']).toContain('text/plain')
    expect(await robots.text()).toContain(
      'Sitemap: https://observatory.geektechlive.com/sitemap.xml',
    )
    const sitemap = await request.get('/sitemap.xml')
    expect(sitemap.headers()['content-type']).toMatch(/xml/)
    const llms = await request.get('/llms.txt')
    expect(llms.headers()['content-type']).not.toContain('text/html')
  })
})
