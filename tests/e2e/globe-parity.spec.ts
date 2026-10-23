/**
 * Parity matrix (#44): with every feed mocked, each globe layer the SVG globe draws is
 * drawn by the WebGL globe too. Asserted on what the renderer actually draws
 * (data-globe-layers) and on the bezel census, never on props.
 * Launch-pad markers are covered by the planLayers unit test.
 */
import { expect, type Page, test } from '@playwright/test'

const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
})

async function mockFeeds(page: Page): Promise<void> {
  await page.route('/api/eonet', (r) =>
    r.fulfill(
      json({
        title: 'EONET Events',
        description: 'Natural events',
        link: 'https://eonet.gsfc.nasa.gov/api/v3/events',
        events: [
          {
            id: 'E1',
            title: 'Storm',
            link: 'https://eonet.gsfc.nasa.gov/api/v3/events/E1',
            closed: null,
            description: null,
            categories: [{ id: 'severeStorms', title: 'Severe Storms' }],
            sources: [],
            geometry: [{ type: 'Point', date: '2026-10-10T00:00:00Z', coordinates: [20, 10] }],
          },
        ],
      }),
    ),
  )
  await page.route('/api/quakes', (r) =>
    r.fulfill(
      json({
        updatedAt: '2026-10-10T00:00:00Z',
        quakes: [
          {
            id: 'q1',
            mag: 6.1,
            place: 'off Honshu, Japan',
            lat: 38.1,
            lon: 142.9,
            depthKm: 10,
            time: 1_790_000_000_000,
            tsunami: false,
            url: 'https://earthquake.usgs.gov/x',
          },
        ],
      }),
    ),
  )
  await page.route('/api/fires', (r) =>
    r.fulfill(
      json({
        fires: [
          {
            lat: -18.4,
            lon: 26.5,
            frp: 12.3,
            confidence: 'n',
            acqDate: '2026-10-10',
            daynight: 'N',
          },
          {
            lat: 35.4,
            lon: -118.6,
            frp: 220,
            confidence: 'h',
            acqDate: '2026-10-10',
            daynight: 'D',
          },
        ],
        total: 2,
        updatedAt: '2026-10-10T00:00:00Z',
      }),
    ),
  )
  await page.route('/api/fireball', (r) =>
    r.fulfill(
      json({
        count: '1',
        data: [
          {
            date: '2026-10-09 12:00:00',
            energy: '2.1',
            impactE: '0.1',
            lat: '31.0',
            latDir: 'N',
            lon: '40.2',
            lonDir: 'W',
            alt: '30.0',
            vel: '15.0',
          },
        ],
      }),
    ),
  )
  await page.route('/api/gdacs', (r) =>
    r.fulfill(
      json({
        events: [
          {
            id: 'g1',
            type: 'TC',
            name: 'Cyclone X',
            alert: 'Red',
            lat: -15,
            lon: 120,
            country: 'AU',
            from: '2026-10-09T00:00:00',
          },
        ],
        updatedAt: '2026-10-10T00:00:00Z',
      }),
    ),
  )
  // A real Hubble TLE (2026-10-10); the hook propagates it with satellite.js in the browser.
  await page.route('/api/satellites', (r) =>
    r.fulfill(
      json({
        satellites: [
          {
            name: 'Hubble',
            line1: '1 20580U 90037B   26283.95144126  .00008494  00000+0  26031-3 0  9996',
            line2: '2 20580  28.4737   8.6621 0001735  14.6522 345.4124 15.31895111806335',
          },
        ],
        updatedAt: '2026-10-10T00:00:00Z',
      }),
    ),
  )
  await page.route('/api/aurora', (r) =>
    r.fulfill(
      json({
        points: [
          [0, 70, 0.8],
          [10, 70, 0.5],
          [20, 71, 0.3],
        ],
        observationTime: '2026-10-10T00:00:00Z',
        forecastTime: '2026-10-10T00:30:00Z',
        updatedAt: '2026-10-10T00:00:00Z',
      }),
    ),
  )
}

/** A layer switch, opening the Layers disclosure first (closed by default since #63). */
async function layerSwitch(page: Page, opts: { name: RegExp }) {
  const chip = page.getByRole('button', { name: /Layers/ })
  if ((await chip.getAttribute('aria-expanded')) === 'false') await chip.click()
  return page.getByRole('switch', opts)
}

const drawn = async (page: Page): Promise<Record<string, number>> =>
  JSON.parse(
    (await page.locator('canvas[data-globe-webgl]').getAttribute('data-globe-layers')) ?? '{}',
  ) as Record<string, number>

test.describe('Globe parity (#44)', () => {
  test('every toggleable layer is drawn by the WebGL globe', async ({ page }) => {
    await mockFeeds(page)
    await page.goto('/?globe=webgl')
    await expect(page.locator('[data-globe-mode]')).toHaveAttribute('data-globe-mode', 'webgl', {
      timeout: 15_000,
    })
    // Aurora is on by default since #62, so it is not toggled here.
    for (const name of ['Fires', 'Alerts', 'Fireballs', 'Satellites']) {
      await (await layerSwitch(page, { name: new RegExp(name) })).click()
    }

    await expect
      .poll(() => drawn(page), { timeout: 15_000 })
      .toMatchObject({
        events: 1,
        quakes: 1,
        fires: 2,
        fireballs: 1,
        disasters: 1,
        aurora: 3,
        satellites: 1,
      })
  })

  test('satellites on: the globe does not rebuild its markers while the ISS moves (#60)', async ({
    page,
  }) => {
    await mockFeeds(page)
    await page.goto('/?globe=webgl')
    await expect(page.locator('[data-globe-mode]')).toHaveAttribute('data-globe-mode', 'webgl', {
      timeout: 15_000,
    })
    await (await layerSwitch(page, { name: /Satellites/ })).click()
    await expect.poll(() => drawn(page), { timeout: 15_000 }).toMatchObject({ satellites: 1 })
    const canvas = page.locator('canvas[data-globe-webgl]')
    const builds = async () => Number((await canvas.getAttribute('data-globe-builds')) ?? '0')
    const before = await builds()
    expect(before).toBeGreaterThan(0)
    // About 15 ISS updates at 5 Hz and one satellite refresh (every 2 s).
    await page.waitForTimeout(3000)
    expect(await builds()).toBe(before)
  })

  test('switching a layer off removes it, and the census lane follows', async ({ page }) => {
    await mockFeeds(page)
    await page.goto('/?globe=webgl')
    await expect(page.locator('[data-globe-mode]')).toHaveAttribute('data-globe-mode', 'webgl', {
      timeout: 15_000,
    })
    await (await layerSwitch(page, { name: /Fireballs/ })).click()
    await expect.poll(() => drawn(page)).toMatchObject({ fireballs: 1 })
    await expect(page.locator('[data-lane="space"]')).toHaveAttribute('data-state', 'live')

    await (await layerSwitch(page, { name: /Fireballs/ })).click()
    await expect.poll(async () => (await drawn(page))['fireballs'] ?? 0).toBe(0)
    await expect(page.locator('[data-lane="space"]')).toHaveAttribute('data-state', 'off')
  })

  test('a failed feed reads as an error in the census, not a quiet zero', async ({ page }) => {
    await mockFeeds(page)
    await page.route('/api/quakes', (r) => r.fulfill({ status: 503, body: 'upstream down' }))
    await page.goto('/?globe=webgl')
    await expect(page.locator('[data-lane="geo"]')).toHaveAttribute('data-state', /error|live/, {
      timeout: 15_000,
    })
    // EONET has no geophysical events in the mock, so geo depends on quakes alone.
    await expect(page.locator('[data-lane="geo"]')).toHaveAttribute('data-state', 'error', {
      timeout: 30_000,
    })
  })
})
