/**
 * Spacecraft in the orrery (#93). /api/orrery-bodies and the DSN feed are mocked: the
 * Voyagers and Parker move in straight lines from their real 2026-11-06 Horizons states,
 * sampled around today, which is all the page needs to place, label and inspect them.
 */
import { expect, type Page, test } from '@playwright/test'

import { offlineSun } from './swpc'

test.beforeEach(async ({ page }) => {
  await offlineSun(page)
})

const DAY_MS = 86_400_000
const JD_UNIX = 2440587.5
const jdNow = () => Math.floor(Date.now() / DAY_MS) + JD_UNIX

/** A track whose samples run in a straight line from `pos` at `vel` au/day. */
function track(
  naifId: string,
  name: string,
  group: 'deep-space' | 'mission' | 'l1',
  pos: [number, number, number],
  vel: [number, number, number],
) {
  const start = jdNow() - 30
  const fine: number[] = []
  for (let i = 0; i <= 60; i += 1) {
    const t = i - 30
    fine.push(pos[0] + vel[0] * t, pos[1] + vel[1] * t, pos[2] + vel[2] * t, ...vel)
  }
  const coarse: number[] = []
  const coarseStart = jdNow() - 3000
  for (let i = 0; i <= 50; i += 1) {
    const t = coarseStart + i * 100 - jdNow()
    coarse.push(pos[0] + vel[0] * t, pos[1] + vel[1] * t, pos[2] + vel[2] * t)
  }
  return {
    id: `naif:${naifId}`,
    naifId,
    name,
    mission: `${name} (test)`,
    category: 'spacecraft',
    group,
    target: `${name} (spacecraft) (${naifId})`,
    observedUntil: '1992-04-24',
    availableFrom: null,
    availableTo: null,
    fine: { start, step: 1, samples: fine },
    coarse: { start: coarseStart, step: 100, samples: coarse },
  }
}

const PAYLOAD = {
  generatedAt: new Date().toISOString(),
  coarseFetchedAt: new Date().toISOString(),
  frame: 'ecliptic-J2000',
  center: 'Sun',
  timeScale: 'TDB',
  units: { position: 'au', velocity: 'au/day' },
  sourceType: 'ephemeris',
  provider: 'jpl-horizons',
  bodies: [
    track('-31', 'Voyager 1', 'deep-space', [-32.2, -137.1, 99.2], [-0.0012, -0.00786, 0.00568]),
    track('-32', 'Voyager 2', 'deep-space', [40.0, -105.7, -89.9], [0.00243, -0.00539, -0.00654]),
    track('-96', 'Parker Solar Probe', 'mission', [0.2, 0.15, 0.01], [-0.01, 0.02, 0]),
    track('-170', 'JWST', 'l1', [0.73, 0.68, 0], [-0.012, 0.0127, 0]),
  ],
  missing: [],
}

const DSN_XML = `<dsn>
  <station name="cdscc" friendlyName="Canberra" timeUTC="1" timeZoneOffset="0"/>
  <dish name="DSS43" azimuthAngle="1" elevationAngle="2" activity="Telemetry">
    <downSignal active="true" signalType="data" dataRate="160" band="X" power="-150" spacecraft="VGR1" spacecraftID="-31"/>
    <target name="VGR1" id="31" uplegRange="-1" downlegRange="-1" rtlt="170000"/>
  </dish>
</dsn>`

async function openOrrery(page: Page) {
  await page.route('**/api/orrery-bodies', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'X-Data-Age': '3600' },
      body: JSON.stringify(PAYLOAD),
    }),
  )
  await page.route('https://eyes.nasa.gov/dsn/data/dsn.xml*', (route) =>
    route.fulfill({ status: 200, contentType: 'text/xml', body: DSN_XML }),
  )
  await page.goto('/#orrery')
  await expect(page.locator('[data-orrery-mode]')).toHaveAttribute('data-orrery-mode', 'webgl', {
    timeout: 20_000,
  })
}

const canvas = (page: Page) => page.locator('canvas[data-orrery-webgl]')
const craftLabel = (page: Page, name: string) =>
  page.locator('[data-orrery-page] button[data-kind="craft"]', { hasText: name })

test.describe('Spacecraft in the orrery (#93)', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('draws the craft (L1/L2 off by default) and says where they came from', async ({ page }) => {
    await openOrrery(page)
    // Voyager 1 and 2 and Parker; JWST's L1 & L2 group starts hidden.
    await expect(canvas(page)).toHaveAttribute('data-orrery-craft', '3')
    // The status counts every craft in the data, drawn or not.
    await expect(page.getByText(/4 spacecraft from JPL Horizons, sampled 1 h ago/)).toBeVisible()
    await page.getByRole('switch', { name: 'L1 & L2 observatories' }).click()
    await expect(canvas(page)).toHaveAttribute('data-orrery-craft', '4')
  })

  test('a Voyager beyond the Inner view sits on the rim with its distance', async ({ page }) => {
    await openOrrery(page)
    const v1 = craftLabel(page, 'Voyager 1')
    await expect(v1).toBeVisible()
    await expect(v1).toHaveAttribute('data-rim', /top|right|bottom|left/)
    await expect(v1).toContainText(/Voyager 1 · 1\d\d au/)
    // In the Heliosphere view it is inside the frame, labelled normally.
    await page.getByRole('button', { name: 'Heliosphere', exact: true }).click()
    await expect(v1).toHaveAttribute('data-rim', '')
  })

  test('search → inspector: light time, Horizons, DSN contact, and its trajectory', async ({
    page,
  }) => {
    await openOrrery(page)
    await page.getByRole('combobox', { name: /find/i }).fill('voyager 1')
    await page.getByRole('option', { name: 'Voyager 1' }).click()
    const inspector = page.getByRole('complementary', { name: 'Voyager 1' })
    await expect(inspector).toBeVisible()
    await expect(inspector.getByText('JPL Horizons', { exact: true })).toBeVisible()
    await expect(inspector.getByText('Light time')).toBeVisible()
    await expect(inspector.getByText(/In contact now: Canberra, DSS43/)).toBeVisible()
    await expect(canvas(page)).toHaveAttribute('data-orrery-focus', 'naif:-31')
    // The whole-mission path, split at now: drawn behind and ahead.
    await expect(canvas(page)).toHaveAttribute('data-orrery-trajectory', /^[1-9]\d*,[1-9]\d*$/)
  })

  test('DSN contact: a ring on the marker, and "only in contact" leaves just that craft', async ({
    page,
  }) => {
    await openOrrery(page)
    await page.getByRole('button', { name: 'Heliosphere', exact: true }).click()
    await expect(craftLabel(page, 'Voyager 1')).toHaveAttribute('data-dsn', 'contact')
    await page.getByRole('switch', { name: /Only those talking to Earth now \(1\)/ }).click()
    await expect(canvas(page)).toHaveAttribute('data-orrery-craft', '1')
  })

  test('scrubbing outside the data hides the craft and says so, never extrapolating', async ({
    page,
  }) => {
    await openOrrery(page)
    await page.getByRole('button', { name: 'Pause' }).click()
    const date = page.getByRole('textbox', { name: /go to date/i })
    await date.fill('1990-01-01')
    await date.press('Enter')
    await expect(canvas(page)).toHaveAttribute('data-orrery-craft', '0')
    // The stage says why they vanished (#114), not just the search list.
    await expect(page.locator('[data-orrery-nodata]')).toContainText(
      '4 spacecraft have no data for this date and are hidden',
    )
    await page.getByRole('combobox', { name: /find/i }).fill('voyager')
    await expect(page.getByRole('option').first()).toContainText('no data for this date')
    await page.getByRole('option').first().click()
    await expect(
      page
        .getByRole('complementary')
        .getByRole('status')
        .filter({ hasText: 'No data for this date' }),
    ).toBeVisible()
  })
})

/** Heliosphere holds both Voyagers in view, Voyager 2 90 au south included (#93). */
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`Heliosphere frames both Voyagers at ${String(viewport.width)} px (#93)`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await openOrrery(page)
    if (viewport.width < 900)
      await page.getByRole('button', { name: 'Controls', exact: true }).click()
    await page.getByRole('button', { name: 'Heliosphere', exact: true }).click()
    for (const name of ['Voyager 1', 'Voyager 2']) {
      const label = craftLabel(page, name)
      // In view: an ordinary label, not a rim marker.
      await expect(label).toHaveAttribute('data-rim', '')
      await expect(label).toBeVisible()
    }
    // The approximate heliopause ring is labelled, and goes with the Orbits switch.
    // On a phone the label would cross the planets, so only the ring is drawn there.
    const heliopause = page.getByText('Heliopause ≈ 122 au · approx.')
    if (viewport.width < 900) {
      await expect(heliopause).toBeHidden()
      return
    }
    await expect(heliopause).toBeVisible()
    await page.getByRole('switch', { name: 'Orbits' }).click()
    await expect(heliopause).toBeHidden()
  })
}

for (const width of [375, 700, 1440]) {
  test(`craft loaded, nothing overflows at ${String(width)} px (#93)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await openOrrery(page)
    await expect(canvas(page)).toHaveAttribute('data-orrery-craft', '3')
    const overflowing = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    )
    expect(overflowing).toBe(false)
  })
}
