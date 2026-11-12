import { expect, type Page, test } from '@playwright/test'

import { coveredPoints } from './mapCredit'

// More NASA GIBS layers on the map (#211). Tiles come straight from GIBS in the browser, and
// each layer carries GIBS's requested acknowledgment, which is a licence term (#179). GIBS is
// stubbed here, so the test checks what we ask for without depending on NASA's network.

const GIBS = 'https://gibs.earthdata.nasa.gov/'
// A 1×1 transparent PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

async function stubGibs(page: Page): Promise<string[]> {
  const requested: string[] = []
  await page.route(`${GIBS}**`, (route) => {
    requested.push(route.request().url())
    return route.fulfill({ status: 200, contentType: 'image/png', body: PNG })
  })
  return requested
}

const ACK =
  "We acknowledge the use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of NASA's Earth Science Data and Information System (ESDIS)."

async function openMap(page: Page, viewport = { width: 1440, height: 900 }) {
  await page.setViewportSize(viewport)
  await page.goto('/')
  await page.getByRole('button', { name: 'Map', exact: true }).click()
  await expect(page.locator('.maplibregl-canvas')).toBeVisible({ timeout: 15_000 })
}

for (const { layer, tilePath, credit } of [
  {
    layer: 'Night lights',
    tilePath: '/VIIRS_Black_Marble/default/2016-01-01/GoogleMapsCompatible_Level8/',
    credit: 'Black Marble 2016',
  },
  {
    layer: 'Precipitation',
    tilePath:
      /\/IMERG_Precipitation_Rate\/default\/\d{4}-\d{2}-\d{2}\/GoogleMapsCompatible_Level6\//,
    credit: 'GPM IMERG',
  },
]) {
  test(`${layer} is off by default, then loads GIBS tiles and credits GIBS (#211)`, async ({
    page,
  }) => {
    const requested = await stubGibs(page)
    await openMap(page)
    const credits = page.locator('.maplibregl-ctrl-attrib-inner')
    await page.getByRole('button', { name: /Layers/ }).click()
    const toggle = page.getByRole('switch', { name: layer })
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    expect(requested).toEqual([])
    await expect(credits).not.toContainText('Global Imagery Browse Services')

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await expect
      .poll(() =>
        requested.some((url) =>
          typeof tilePath === 'string' ? url.includes(tilePath) : tilePath.test(url),
        ),
      )
      .toBe(true)
    await expect(credits).toContainText(credit)
    await expect(credits).toContainText(ACK)

    await toggle.click()
    await expect(credits).not.toContainText(credit)
    await expect(credits).not.toContainText(ACK)
  })
}

// GIBS's acknowledgment is long. It must show once however many GIBS layers are on, and the
// credit must wrap rather than run under the ISS plate (#94, #179).
for (const { width, height, expand } of [
  { width: 1920, height: 1080, expand: false },
  { width: 1440, height: 900, expand: false },
  { width: 1024, height: 768, expand: false },
  { width: 1440, height: 900, expand: true },
]) {
  test(`with every GIBS layer on, one acknowledgment, clear of the plates at ${width}px${expand ? ' expanded' : ''} (#211)`, async ({
    page,
  }) => {
    await stubGibs(page)
    await openMap(page, { width, height })
    await page.getByRole('button', { name: /Layers/ }).click()
    for (const name of ['Imagery', 'Night lights', 'Precipitation']) {
      await page.getByRole('switch', { name }).click()
    }
    await page.getByRole('button', { name: /Layers/ }).click()
    if (expand) await page.getByRole('button', { name: 'Expand view' }).click()
    const credits = page.locator('.maplibregl-ctrl-attrib-inner')
    await expect(credits).toContainText('Black Marble 2016')
    await expect(credits).toContainText('GPM IMERG')
    await expect(credits).toContainText('MODIS')
    await expect(credits).toContainText('CARTO', { timeout: 15_000 })
    const text = await credits.innerText()
    expect(text.split('Global Imagery Browse Services').length - 1).toBe(1)
    expect(await coveredPoints(page)).toEqual([])
  })
}
