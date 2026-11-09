import { expect, type Page, test } from '@playwright/test'

// RocketLaunch.live asks for its credit "somewhere near the data" (#183): it has to be
// on screen, uncovered, and clear of the lens plates and the globe's controls.

const CREDIT = 'Data by RocketLaunch.Live'

const LAUNCHES = {
  valid_auth: true,
  count: 1,
  result: [
    {
      id: 1,
      name: 'Test launch',
      sort_date: '1893456000',
      t0: '2030-01-01T00:00:00Z',
      slug: 'test-launch',
      vehicle: { id: 1, name: 'Falcon 9' },
      pad: { id: 1, name: 'LC-39A', latitude: '28.6', longitude: '-80.6' },
    },
  ],
}

async function showLaunchPads(page: Page) {
  await page.route('**/api/launches*', (route) => route.fulfill({ json: LAUNCHES }))
  await page.goto('/')
  await page.getByRole('button', { name: /Layers/ }).click()
  await page.getByRole('switch', { name: 'Launch pads' }).click()
  // The open menu is not part of the resting layout.
  await page.getByRole('button', { name: /Layers/ }).click()
  await expect(page.getByRole('link', { name: CREDIT })).toBeVisible()
}

/** Points of the credit under something else, plus any plate or control it overlaps. */
async function coveredPoints(page: Page) {
  return page.getByRole('link', { name: CREDIT }).evaluate((el) => {
    const r = el.getBoundingClientRect()
    const others = [
      ...document.querySelectorAll('[data-lens-plates] > *'),
      ...document.querySelectorAll('[data-globe-mode] ~ div button'),
      ...document.querySelectorAll('[aria-label="Map layers"] button'),
    ]
    const overlaps = others
      .map((other) => other.getBoundingClientRect())
      .filter((p) => p.width > 0 && p.height > 0)
      .filter((p) => p.left < r.right && r.left < p.right && p.top < r.bottom && r.top < p.bottom)
      .map((p) => `overlaps ${Math.round(p.left)},${Math.round(p.top)}`)
    const points: [number, number][] = [
      [r.left + r.width / 2, r.top + r.height / 2],
      [r.left + 2, r.top + r.height / 2],
      [r.right - 2, r.top + r.height / 2],
    ]
    const covered = points
      .filter(([x, y]) => !el.contains(document.elementFromPoint(x, y)))
      .map(([x, y]) => `${Math.round(x)},${Math.round(y)}`)
    return [...covered, ...overlaps]
  })
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
  { width: 1000, height: 768 },
  { width: 920, height: 1180 },
  { width: 768, height: 1024 },
  { width: 660, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`the launch credit is readable and uncovered at ${viewport.width}px (#183)`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await showLaunchPads(page)
    // Centred, so a phone's fixed dial bar isn't the thing "covering" it.
    await page.getByRole('link', { name: CREDIT }).evaluate((el) => {
      el.scrollIntoView({ block: 'center' })
    })
    expect(await coveredPoints(page)).toEqual([])
    const noSideways = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    )
    expect(noSideways).toBe(true)
  })
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1024, height: 768 },
]) {
  test(`the launch credit stays uncovered with the globe expanded at ${viewport.width}px (#183)`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await showLaunchPads(page)
    await page.getByRole('button', { name: 'Expand view' }).click()
    await expect(page.getByRole('link', { name: CREDIT })).toBeInViewport({ ratio: 1 })
    expect(await coveredPoints(page)).toEqual([])
  })
}

test('switching the layer off takes the credit away (#183)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await showLaunchPads(page)
  await page.getByRole('button', { name: /Layers/ }).click()
  await page.getByRole('switch', { name: 'Launch pads' }).click()
  await expect(page.getByRole('link', { name: CREDIT })).toHaveCount(0)
})
