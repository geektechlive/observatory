/**
 * The "Look closer" view (#203, ADR 0021): a canvas and renderer of its own, mounted only
 * while it is open, with the orrery detached behind it. /api/orrery-bodies is mocked with
 * craft moving in straight lines; Voyager 1 and Parker have NASA models, Psyche a built
 * stand-in (no download), and "Plain Probe" no model at all.
 */
import { expect, type Locator, type Page, test } from '@playwright/test'

import { offlineSun } from './swpc'

test.beforeEach(async ({ page }) => {
  await offlineSun(page)
})

test.use({ viewport: { width: 1440, height: 900 } })

const DAY_MS = 86_400_000
const JD_UNIX = 2440587.5
const jdNow = () => Math.floor(Date.now() / DAY_MS) + JD_UNIX

function track(
  naifId: string,
  name: string,
  pos: [number, number, number],
  vel: [number, number, number],
) {
  const start = jdNow() - 30
  const fine: number[] = []
  for (let i = 0; i <= 60; i += 1) {
    const t = i - 30
    fine.push(pos[0] + vel[0] * t, pos[1] + vel[1] * t, pos[2] + vel[2] * t, ...vel)
  }
  return {
    id: `naif:${naifId}`,
    naifId,
    name,
    mission: `${name} (test)`,
    category: 'spacecraft',
    group: 'mission',
    target: `${name} (spacecraft) (${naifId})`,
    observedUntil: null,
    availableFrom: null,
    availableTo: null,
    fine: { start, step: 1, samples: fine },
    coarse: null,
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
    track('-31', 'Voyager 1', [-32.2, -137.1, 99.2], [-0.0012, -0.00786, 0.00568]),
    track('-96', 'Parker Solar Probe', [0.2, 0.15, 0.01], [-0.01, 0.02, 0]),
    track('-255', 'Psyche', [1.2, 1.3, 0.05], [-0.008, 0.007, 0]),
    track('-78', 'DSCOVR', [0.99, 0.12, 0.01], [-0.002, 0.016, 0]),
    track('-777', 'Plain Probe', [2.2, 0.3, 0.05], [-0.004, 0.007, 0]),
  ],
  missing: [],
}

const orreryCanvas = (page: Page) => page.locator('canvas[data-orrery-webgl]')
const detailView = (page: Page) => page.locator('[data-detail-view]')
const detailCanvas = (page: Page) => page.locator('canvas[data-detail-canvas]')
const pageRoot = (page: Page) => page.locator('[data-orrery-page]')
const lookCloser = (page: Page) => page.getByRole('button', { name: 'Look closer' })

async function openOrrery(page: Page, hash = '#orrery') {
  await page.route('**/api/orrery-bodies', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PAYLOAD) }),
  )
  await page.route('https://eyes.nasa.gov/dsn/data/dsn.xml*', (route) =>
    route.fulfill({ status: 200, contentType: 'text/xml', body: '<dsn></dsn>' }),
  )
  await page.goto(`/${hash}`)
  await expect(page.locator('[data-orrery-mode]')).toHaveAttribute('data-orrery-mode', 'webgl', {
    timeout: 20_000,
  })
  // A link that opens the detail view has the orrery detached already.
  if (!hash.includes('detail=1')) {
    await expect(orreryCanvas(page)).toHaveAttribute('data-orrery-craft', '5')
  }
}

async function focus(page: Page, name: string) {
  const search = page.getByRole('combobox', { name: /find/i })
  await search.fill(name)
  await page.getByRole('option', { name, exact: true }).click()
}

async function openDetail(page: Page) {
  await lookCloser(page).click()
  await expect(detailView(page)).toHaveAttribute('data-detail-status', 'ready', {
    timeout: 20_000,
  })
}

const attr = async (locator: Locator, name: string) =>
  Number((await locator.getAttribute(name)) ?? 'NaN')

test('a drag on the detail canvas turns the model and neither selects nor closes', async ({
  page,
}) => {
  await openOrrery(page)
  await focus(page, 'Voyager 1')
  await openDetail(page)
  const hashBefore = await page.evaluate(() => window.location.hash)
  const box = await detailCanvas(page).boundingBox()
  expect(box).not.toBeNull()
  if (!box) return
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 90, y + 30, { steps: 8 })
  await page.mouse.up()
  await expect(detailView(page)).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Voyager 1' })).toBeVisible()
  expect(await page.evaluate(() => window.location.hash)).toBe(hashBefore)
  await expect(detailCanvas(page)).toHaveCount(1)
})

test('while the view is open the orrery is off the page and idle; closing brings it back drawing', async ({
  page,
}) => {
  await openOrrery(page)
  await focus(page, 'Voyager 1')
  const handle = await orreryCanvas(page).elementHandle()
  const drawsBefore = Number(await handle.getAttribute('data-orrery-draws'))
  await openDetail(page)
  await expect(orreryCanvas(page)).toHaveCount(0)
  expect(await handle.getAttribute('data-orrery-animating')).toBe('false')
  const frozen = await handle.getAttribute('data-orrery-draws')
  await page.waitForTimeout(1500)
  expect(await handle.getAttribute('data-orrery-draws')).toBe(frozen)
  await detailView(page).getByRole('button', { name: 'Back to orrery' }).click()
  await expect(detailView(page)).toHaveCount(0)
  await expect(orreryCanvas(page)).toHaveCount(1)
  await expect
    .poll(async () => Number(await orreryCanvas(page).getAttribute('data-orrery-draws')))
    .toBeGreaterThan(drawsBefore)
})

test('opening the view 30 times leaves no canvas, scene, model or orrery GPU object behind', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const warnings: string[] = []
  page.on('console', (m) => {
    warnings.push(m.text())
  })
  await openOrrery(page)
  await focus(page, 'Psyche')
  await expect(orreryCanvas(page)).toHaveAttribute('data-orrery-model', 'simplified:-255')
  const cycle = async () => {
    await openDetail(page)
    await expect(detailCanvas(page)).toHaveCount(1)
    await expect(pageRoot(page)).toHaveAttribute('data-orrery-detail-scenes', '1')
    await expect(pageRoot(page)).toHaveAttribute('data-orrery-detail-models', '1')
    await detailView(page).getByRole('button', { name: 'Back to orrery' }).click()
    await expect(detailView(page)).toHaveCount(0)
    await expect(orreryCanvas(page)).toHaveCount(1)
  }
  await cycle()
  await page.waitForTimeout(800)
  const base = {
    geometries: await attr(orreryCanvas(page), 'data-orrery-geometries'),
    textures: await attr(orreryCanvas(page), 'data-orrery-textures'),
  }
  for (let i = 0; i < 29; i += 1) await cycle()
  await page.waitForTimeout(1000)
  await expect(detailCanvas(page)).toHaveCount(0)
  await expect(pageRoot(page)).toHaveAttribute('data-orrery-detail-scenes', '0')
  await expect(pageRoot(page)).toHaveAttribute('data-orrery-detail-models', '0')
  await expect(pageRoot(page)).toHaveAttribute('data-orrery-detail-opened', '30')
  expect(await attr(orreryCanvas(page), 'data-orrery-geometries')).toBeLessThanOrEqual(
    base.geometries,
  )
  expect(await attr(orreryCanvas(page), 'data-orrery-textures')).toBeLessThanOrEqual(base.textures)
  expect(warnings.filter((w) => /too many active webgl contexts/i.test(w))).toEqual([])
})

test('opening a real, textured GLB model 12 times frees every geometry and texture it made', async ({
  page,
}) => {
  test.setTimeout(120_000)
  await openOrrery(page)
  // Parker's file carries textures; the renderer holds one of its own besides.
  await focus(page, 'Parker Solar Probe')
  await expect(orreryCanvas(page)).toHaveAttribute('data-orrery-model', 'model:-96', {
    timeout: 15_000,
  })
  for (let i = 0; i < 12; i += 1) {
    await openDetail(page)
    // The model is really on the GPU while the view is open.
    await expect
      .poll(async () => attr(detailCanvas(page), 'data-detail-geometries'))
      .toBeGreaterThan(0)
    await expect
      .poll(async () => attr(detailCanvas(page), 'data-detail-textures'))
      .toBeGreaterThan(1)
    await detailView(page).getByRole('button', { name: 'Back to orrery' }).click()
    await expect(detailView(page)).toHaveCount(0)
  }
  // After each dispose the renderer was asked how many geometries and textures it still
  // held (renderer.info.memory, once the model's own dispose had run): none may remain.
  await expect(pageRoot(page)).toHaveAttribute('data-orrery-detail-leaked', '0')
  await expect(pageRoot(page)).toHaveAttribute('data-orrery-detail-opened', '12')
  await expect(pageRoot(page)).toHaveAttribute('data-orrery-detail-scenes', '0')
  await expect(pageRoot(page)).toHaveAttribute('data-orrery-detail-models', '0')
})

test('a cold load of a detail link opens the view, keeps the clock live and leaves no t in the address', async ({
  page,
}) => {
  await openOrrery(page, '#orrery?focus=naif:-31&detail=1')
  await expect(detailView(page)).toHaveAttribute('data-detail-status', 'ready', {
    timeout: 20_000,
  })
  await expect(orreryCanvas(page)).toHaveCount(0)
  const hash = await page.evaluate(() => window.location.hash)
  expect(hash).toContain('focus=naif:-31')
  expect(hash).toContain('detail=1')
  expect(hash).not.toMatch(/[?&]t=/)
  // Live: the readout is the wall clock (to the minute), not a frozen moment.
  const readout = (await page.locator('output', { hasText: /UTC/ }).first().textContent()) ?? ''
  const match = /(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}) UTC/.exec(readout)
  expect(match).not.toBeNull()
  const shown = Date.UTC(
    Number(match?.[1]),
    Number(match?.[2]) - 1,
    Number(match?.[3]),
    Number(match?.[4]),
    Number(match?.[5]),
  )
  expect(Math.abs(Date.now() - shown)).toBeLessThan(3 * 60_000)
})

test('Escape closes the view, the inspector keeps its object and focus returns to the button', async ({
  page,
}) => {
  await openOrrery(page)
  await focus(page, 'Voyager 1')
  await openDetail(page)
  await page.keyboard.press('Escape')
  await expect(detailView(page)).toHaveCount(0)
  await expect(page.getByRole('complementary', { name: 'Voyager 1' })).toBeVisible()
  await expect(lookCloser(page)).toBeFocused()
  await expect(orreryCanvas(page)).toHaveCount(1)
  expect(await page.evaluate(() => window.location.hash)).not.toContain('detail=1')
})

test('a model that fails to load keeps the view open with Retry, and Retry shows the model', async ({
  page,
}) => {
  let mode: 'pass' | 'fail' = 'pass'
  await page.route('**/models/craft/voyager.glb', (route) =>
    mode === 'fail' ? route.abort('failed') : route.continue(),
  )
  await openOrrery(page)
  await focus(page, 'Voyager 1')
  await expect(orreryCanvas(page)).toHaveAttribute('data-orrery-model', 'model:-31', {
    timeout: 15_000,
  })
  mode = 'fail'
  await lookCloser(page).click()
  await expect(detailView(page)).toHaveAttribute('data-detail-status', 'failed', {
    timeout: 15_000,
  })
  await expect(page.getByText('Model unavailable')).toBeVisible()
  // The facts stay beside it.
  await expect(page.getByRole('complementary', { name: 'Voyager 1' })).toBeVisible()
  mode = 'pass'
  await page.getByRole('button', { name: 'Retry' }).click()
  await expect(detailView(page)).toHaveAttribute('data-detail-status', 'ready', {
    timeout: 15_000,
  })
  await expect(page.getByText('Model unavailable')).toHaveCount(0)
  await expect(pageRoot(page)).toHaveAttribute('data-orrery-detail-models', '1')
})

test('closing during a slow load aborts it and mounts nothing afterwards', async ({ page }) => {
  let mode: 'pass' | 'hold' = 'pass'
  let release: () => void = () => undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route('**/models/craft/voyager.glb', async (route) => {
    if (mode === 'hold') await gate
    await route.continue()
  })
  await openOrrery(page)
  await focus(page, 'Voyager 1')
  await expect(orreryCanvas(page)).toHaveAttribute('data-orrery-model', 'model:-31', {
    timeout: 15_000,
  })
  mode = 'hold'
  await lookCloser(page).click()
  await expect(detailView(page)).toHaveAttribute('data-detail-status', 'loading')
  await page.keyboard.press('Escape')
  await expect(detailView(page)).toHaveCount(0)
  release()
  await page.waitForTimeout(1500)
  await expect(detailView(page)).toHaveCount(0)
  await expect(detailCanvas(page)).toHaveCount(0)
  await expect(pageRoot(page)).toHaveAttribute('data-orrery-detail-scenes', '0')
  await expect(pageRoot(page)).toHaveAttribute('data-orrery-detail-models', '0')
  await expect(orreryCanvas(page)).toHaveCount(1)
})

test('an object with no model has no Look closer button, and a link to one falls back to the focus', async ({
  page,
}) => {
  await openOrrery(page)
  await focus(page, 'Plain Probe')
  await expect(page.getByRole('complementary', { name: 'Plain Probe' })).toBeVisible()
  await expect(lookCloser(page)).toHaveCount(0)
  await focus(page, 'Mars')
  await expect(page.getByRole('complementary', { name: 'Mars' })).toBeVisible()
  await expect(lookCloser(page)).toHaveCount(0)
  await focus(page, 'Psyche')
  await expect(lookCloser(page)).toHaveCount(1)
})

test('a detail link to an object with no model opens the focus alone', async ({ page }) => {
  await openOrrery(page, '#orrery?focus=naif:-777&detail=1')
  await expect(page.getByRole('complementary', { name: 'Plain Probe' })).toBeVisible()
  await expect(detailView(page)).toHaveCount(0)
  await expect(orreryCanvas(page)).toHaveCount(1)
  await expect.poll(() => page.evaluate(() => window.location.hash)).not.toContain('detail=1')
})

test('after closing, the orrery inset matches the inspector as it is now', async ({ page }) => {
  await openOrrery(page)
  await focus(page, 'Voyager 1')
  const insetBefore = await orreryCanvas(page).getAttribute('data-orrery-inset')
  await openDetail(page)
  // The window narrows while the view is open: the inspector becomes a bottom sheet.
  await page.setViewportSize({ width: 800, height: 900 })
  await page.waitForTimeout(500)
  await detailView(page).getByRole('button', { name: 'Back to orrery' }).click()
  await expect(detailView(page)).toHaveCount(0)
  await expect(orreryCanvas(page)).toHaveCount(1)
  const [stage, panel] = await Promise.all([
    page.getByRole('region', { name: 'Orrery' }).boundingBox(),
    page.getByRole('complementary', { name: 'Voyager 1' }).boundingBox(),
  ])
  expect(stage).not.toBeNull()
  expect(panel).not.toBeNull()
  if (!stage || !panel) return
  const sheet = panel.width > stage.width * 0.6
  const expectedBottom = sheet ? stage.y + stage.height - panel.y : 0
  const expectedRight = sheet ? 0 : stage.x + stage.width - panel.x
  await expect
    .poll(async () => {
      const [right, bottom] = (await orreryCanvas(page).getAttribute('data-orrery-inset'))
        ?.split(',')
        .map(Number) ?? [Number.NaN, Number.NaN]
      return [Math.round(right ?? Number.NaN), Math.round(bottom ?? Number.NaN)]
    })
    .toEqual([Math.round(expectedRight), Math.round(expectedBottom)])
  expect(sheet).toBe(true)
  expect(await orreryCanvas(page).getAttribute('data-orrery-inset')).not.toBe(insetBefore)
})

const camera = async (page: Page) =>
  ((await detailCanvas(page).getAttribute('data-detail-camera')) ?? '').split(',').map(Number)

test('the model turns and zooms from the keyboard and from the zoom buttons', async ({ page }) => {
  await openOrrery(page)
  await focus(page, 'Voyager 1')
  await openDetail(page)
  const model = page.getByRole('group', { name: /Model of Voyager 1/ })
  await model.focus()
  const [theta0 = 0, phi0 = 0, dist0 = 0] = await camera(page)
  await page.keyboard.press('ArrowLeft')
  await expect.poll(async () => (await camera(page))[0]).toBeLessThan(theta0)
  await page.keyboard.press('ArrowDown')
  await expect.poll(async () => (await camera(page))[1]).toBeGreaterThan(phi0)
  await page.keyboard.press('+')
  await expect.poll(async () => (await camera(page))[2]).toBeLessThan(dist0)
  const closer = (await camera(page))[2] ?? 0
  await detailView(page).getByRole('button', { name: 'Zoom out' }).click()
  await expect.poll(async () => (await camera(page))[2]).toBeGreaterThan(closer)
  await expect(detailView(page)).toBeVisible()
})

test('a close that is not Back or Escape leaves focus alone', async ({ page }) => {
  await openOrrery(page)
  await focus(page, 'Voyager 1')
  await openDetail(page)
  // A pasted link to another object closes the view (the selection changes).
  await page.evaluate(() => {
    window.location.hash = '#orrery?focus=naif:-96'
  })
  await expect(detailView(page)).toHaveCount(0)
  await expect(page.getByRole('complementary', { name: 'Parker Solar Probe' })).toBeVisible()
  await expect(lookCloser(page)).not.toBeFocused()
})

test.describe('on a phone (390 x 844)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

  async function openOnPhone(page: Page) {
    await page.route('**/api/orrery-bodies', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(PAYLOAD),
      }),
    )
    await page.route('https://eyes.nasa.gov/dsn/data/dsn.xml*', (route) =>
      route.fulfill({ status: 200, contentType: 'text/xml', body: '<dsn></dsn>' }),
    )
    await page.goto('/#orrery')
    await expect(page.locator('[data-orrery-mode]')).toHaveAttribute('data-orrery-mode', 'webgl', {
      timeout: 20_000,
    })
    await page.getByRole('button', { name: 'Controls' }).click()
    await focus(page, 'Voyager 1')
    await expect(orreryCanvas(page)).toHaveAttribute('data-orrery-model', 'model:-31', {
      timeout: 15_000,
    })
  }

  const coveredBy = (target: Locator) =>
    target.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return top === el || el.contains(top) ? null : (top?.className ?? 'nothing')
    })

  test('a failed load shows Retry in the model band, not under the inspector sheet', async ({
    page,
  }) => {
    let fail = false
    await page.route('**/models/craft/voyager.glb', (route) =>
      fail ? route.abort('failed') : route.continue(),
    )
    await openOnPhone(page)
    fail = true
    await lookCloser(page).click()
    await expect(detailView(page)).toHaveAttribute('data-detail-status', 'failed', {
      timeout: 15_000,
    })
    const retry = page.getByRole('button', { name: 'Retry' })
    await expect(retry).toBeVisible()
    expect(await coveredBy(retry)).toBeNull()
    await expect(page.getByText('Model unavailable')).toBeInViewport()
  })

  test('the model band stays tall enough to see the model', async ({ page }) => {
    await openOnPhone(page)
    await openDetail(page)
    const band = await page.getByRole('group', { name: /Model of Voyager 1/ }).boundingBox()
    const stage = await page.getByRole('region', { name: 'Orrery' }).boundingBox()
    const sheet = await page.getByRole('complementary', { name: 'Voyager 1' }).boundingBox()
    expect(band).not.toBeNull()
    expect(stage).not.toBeNull()
    expect(sheet).not.toBeNull()
    if (!band || !stage || !sheet) return
    expect(band.height).toBeGreaterThanOrEqual(160)
    expect(sheet.height).toBeLessThanOrEqual(stage.height * 0.41)
  })
})
