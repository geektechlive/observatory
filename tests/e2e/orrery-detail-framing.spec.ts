/**
 * "Look closer" framing and layout (#205): the model is framed by its full bounds, so no part
 * is cropped at the default view or at the zoom-out limit, and the canvas sits between the top
 * bar and the credit band, so nothing draws under the credit line (a licence term), the title
 * or the controls. The shipped JWST and Parker models load for real (SwiftShader); Psyche is
 * the code-built stand-in. The canvas probe `data-detail-fit` is the model's projected
 * bounding box in CSS px from the canvas's top left: "minX,minY,maxX,maxY".
 */
import { expect, type Locator, type Page, test } from '@playwright/test'

import { offlineSun } from './swpc'

test.beforeEach(async ({ page }) => {
  await offlineSun(page)
})

const DAY_MS = 86_400_000
const JD_UNIX = 2440587.5
const jdNow = () => Math.floor(Date.now() / DAY_MS) + JD_UNIX

function track(naifId: string, name: string, pos: [number, number, number]) {
  const start = jdNow() - 30
  const fine: number[] = []
  for (let i = 0; i <= 60; i += 1) fine.push(pos[0], pos[1], pos[2], 0, 0, 0)
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
    track('-170', 'James Webb Space Telescope', [1.01, 0.01, 0.0]),
    track('-96', 'Parker Solar Probe', [0.2, 0.15, 0.01]),
    track('-255', 'Psyche', [1.2, 1.3, 0.05]),
  ],
  missing: [],
}

const detailView = (page: Page) => page.locator('[data-detail-view]')
const detailCanvas = (page: Page) => page.locator('canvas[data-detail-canvas]')

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

const rectOf = async (locator: Locator): Promise<Rect> => {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  return box ?? { x: 0, y: 0, width: 0, height: 0 }
}

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width - 0.5 &&
  b.x < a.x + a.width - 0.5 &&
  a.y < b.y + b.height - 0.5 &&
  b.y < a.y + a.height - 0.5

/**
 * The probe costs a pass over every vertex a frame, so the scene writes it only when the canvas
 * already carries `data-detail-fit`. This puts the attribute on each detail canvas the moment
 * it joins the page, before its first frame.
 */
async function enableFitProbe(page: Page) {
  await page.addInitScript(() => {
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof HTMLElement)) continue
          const canvas = node.matches('canvas[data-detail-canvas]')
            ? node
            : node.querySelector('canvas[data-detail-canvas]')
          canvas?.setAttribute('data-detail-fit', '')
        }
      }
    }).observe(document, { childList: true, subtree: true })
  })
}

async function openDetailOf(page: Page, name: string, probe = true) {
  if (probe) await enableFitProbe(page)
  await page.route('**/api/orrery-bodies', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(PAYLOAD) }),
  )
  await page.route('https://eyes.nasa.gov/dsn/data/dsn.xml*', (route) =>
    route.fulfill({ status: 200, contentType: 'text/xml', body: '<dsn></dsn>' }),
  )
  await page.goto('/#orrery')
  await expect(page.locator('[data-orrery-mode]')).toHaveAttribute('data-orrery-mode', 'webgl', {
    timeout: 20_000,
  })
  const controls = page.getByRole('button', { name: 'Controls' })
  if (await controls.isVisible()) await controls.click()
  const search = page.getByRole('combobox', { name: /find/i })
  await search.fill(name)
  await page.getByRole('option', { name, exact: true }).click()
  await page.getByRole('button', { name: 'Look closer' }).click()
  await expect(detailView(page)).toHaveAttribute('data-detail-status', 'ready', {
    timeout: 25_000,
  })
  // The probe is written by the first frame after the model arrives.
  if (probe) await expect(detailCanvas(page)).toHaveAttribute('data-detail-fit', /,/)
}

for (const name of ['James Webb Space Telescope', 'Parker Solar Probe']) {
  test(`${name}: at full zoom in, every vertex is still in front of the camera and the outline is finite`, async ({
    page,
  }) => {
    await openDetailOf(page, name)
    const distance = async () =>
      Number(((await detailCanvas(page).getAttribute('data-detail-camera')) ?? '').split(',')[2])
    const start = await distance()
    const zoomIn = page.getByRole('button', { name: 'Zoom in' })
    for (let i = 0; i < 16; i += 1) await zoomIn.click()
    await expect
      .poll(async () => {
        const before = await distance()
        await page.waitForTimeout(150)
        return before === (await distance())
      })
      .toBe(true)
    expect(await distance()).toBeLessThan(start)
    // The nearest vertex is in front of the camera (a vertex behind it would project flipped).
    const nearest = Number(await detailCanvas(page).getAttribute('data-detail-nearest'))
    expect(nearest, 'the nearest vertex, in front of the camera').toBeGreaterThan(0.01)
    const fit = await fitOf(page)
    for (const n of [fit.minX, fit.minY, fit.maxX, fit.maxY]) expect(Number.isFinite(n)).toBe(true)
  })
}

test('without data-detail-fit on the canvas no fit is written, so production pays nothing per frame', async ({
  page,
}) => {
  await openDetailOf(page, 'Parker Solar Probe', false)
  // Turn it and let frames run: still nothing, not even an empty attribute.
  await page.getByRole('button', { name: 'Zoom out' }).click()
  await expect
    .poll(async () =>
      Number(((await detailCanvas(page).getAttribute('data-detail-camera')) ?? '').split(',')[2]),
    )
    .toBeGreaterThan(0)
  await page.waitForTimeout(300)
  expect(await detailCanvas(page).evaluate((c) => c.hasAttribute('data-detail-fit'))).toBe(false)
})

/** The model's projected box, then asserts it lies inside the canvas. */
async function expectFitInside(page: Page) {
  const canvas = await rectOf(detailCanvas(page))
  const fit = ((await detailCanvas(page).getAttribute('data-detail-fit')) ?? '')
    .split(',')
    .map(Number)
  const [minX = NaN, minY = NaN, maxX = NaN, maxY = NaN] = fit
  expect(
    minX,
    `fit ${fit.join(',')} in canvas ${canvas.width}x${canvas.height}`,
  ).toBeGreaterThanOrEqual(0)
  expect(
    minY,
    `fit ${fit.join(',')} in canvas ${canvas.width}x${canvas.height}`,
  ).toBeGreaterThanOrEqual(0)
  expect(
    maxX,
    `fit ${fit.join(',')} in canvas ${canvas.width}x${canvas.height}`,
  ).toBeLessThanOrEqual(canvas.width)
  expect(
    maxY,
    `fit ${fit.join(',')} in canvas ${canvas.width}x${canvas.height}`,
  ).toBeLessThanOrEqual(canvas.height)
}

/** The model's projected outline as the probe reports it, in canvas px. */
async function fitOf(page: Page) {
  const fit = ((await detailCanvas(page).getAttribute('data-detail-fit')) ?? '')
    .split(',')
    .map(Number)
  const [minX = NaN, minY = NaN, maxX = NaN, maxY = NaN] = fit
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY }
}

/** At the default view the model fills most of the limiting canvas dimension (#205). */
const MIN_FILL = 0.8

async function expectFills(page: Page) {
  const canvas = await rectOf(detailCanvas(page))
  const fit = await fitOf(page)
  const fill = Math.max(fit.width / canvas.width, fit.height / canvas.height)
  expect(
    fill,
    `the model's outline ${fit.width.toFixed(0)}x${fit.height.toFixed(0)} in a canvas ${canvas.width}x${canvas.height}`,
  ).toBeGreaterThanOrEqual(MIN_FILL)
}

async function expectNothingUnderTheText(page: Page) {
  const canvas = await rectOf(detailCanvas(page))
  const credit = await rectOf(page.locator('[data-detail-credit]'))
  expect(overlaps(canvas, credit), 'the canvas overlaps the credit band').toBe(false)
  expect(canvas.y + canvas.height).toBeLessThanOrEqual(credit.y + 0.5)
  // The credit is a licence term: the inspector (a sheet below on a phone) never covers it.
  const sheet = await rectOf(page.getByRole('complementary', { name: /./ }).last())
  expect(overlaps(credit, sheet), 'the inspector overlaps the credit band').toBe(false)
  const others = [
    detailView(page).getByRole('heading', { level: 2 }),
    page.getByRole('button', { name: 'Back to orrery' }),
    page.getByRole('button', { name: 'Zoom in' }),
    page.getByRole('button', { name: 'Zoom out' }),
  ]
  for (const other of others) {
    expect(
      overlaps(canvas, await rectOf(other)),
      'the canvas overlaps the title or a control',
    ).toBe(false)
  }
}

const MODELS = [
  { label: 'JWST (shipped)', name: 'James Webb Space Telescope' },
  { label: 'Parker (shipped)', name: 'Parker Solar Probe' },
  { label: 'Psyche (stand-in)', name: 'Psyche' },
]

const SIZES = [
  { label: '1920 x 1080', width: 1920, height: 1080, touch: false },
  { label: '390 x 844', width: 390, height: 844, touch: true },
]

/** Less than this and a phone's model is a speck: the sheet folds away to give it room. */
const PHONE_BAND_MIN = 280

test.describe('on a phone, the facts fold away while Look closer is open (#205)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

  const factsButton = (page: Page) => page.getByRole('button', { name: 'Facts' })
  const fromTheSun = (page: Page) => page.getByText('From the Sun', { exact: true })

  // JWST's name wraps to two lines in the sheet, the longest header row of the shipped models.
  for (const name of ['Parker Solar Probe', 'James Webb Space Telescope']) {
    test(`${name}: the sheet opens collapsed to its header row and the model gets the room`, async ({
      page,
    }) => {
      await openDetailOf(page, name)
      await expect(factsButton(page)).toHaveAttribute('aria-expanded', 'false')
      await expect(fromTheSun(page)).toBeHidden()
      const sheet = page.getByRole('complementary', { name })
      await expect(sheet.getByRole('button', { name: 'Close' })).toBeVisible()
      await expect
        .poll(async () => (await rectOf(detailCanvas(page))).height)
        .toBeGreaterThanOrEqual(PHONE_BAND_MIN)
      await expectNothingUnderTheText(page)
      await expectFitInside(page)
      await expectFills(page)
    })
  }

  test('Facts expands the sheet to the 40% sheet and collapsing gives the space back', async ({
    page,
  }) => {
    await openDetailOf(page, 'Parker Solar Probe')
    const collapsed = (await rectOf(detailCanvas(page))).height
    await factsButton(page).click()
    await expect(factsButton(page)).toHaveAttribute('aria-expanded', 'true')
    await expect(fromTheSun(page)).toBeVisible()
    const stage = await rectOf(page.getByRole('region', { name: 'Orrery' }))
    const sheet = await rectOf(page.getByRole('complementary', { name: 'Parker Solar Probe' }))
    expect(sheet.height).toBeLessThanOrEqual(stage.height * 0.41)
    await expect.poll(async () => (await rectOf(detailCanvas(page))).height).toBeLessThan(collapsed)
    // The credit is a licence term: still clear of the sheet, and the model still whole.
    await expectNothingUnderTheText(page)
    await expectFitInside(page)
    await factsButton(page).click()
    await expect(factsButton(page)).toHaveAttribute('aria-expanded', 'false')
    await expect(fromTheSun(page)).toBeHidden()
    await expect
      .poll(async () => (await rectOf(detailCanvas(page))).height)
      .toBeGreaterThanOrEqual(PHONE_BAND_MIN)
  })

  test('the toggle works from the keyboard, keeps focus, and a reopened view starts collapsed', async ({
    page,
  }) => {
    await openDetailOf(page, 'Parker Solar Probe')
    await factsButton(page).focus()
    await page.keyboard.press('Enter')
    await expect(factsButton(page)).toHaveAttribute('aria-expanded', 'true')
    await expect(factsButton(page)).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(detailView(page)).toHaveCount(0)
    // Back out with the sheet open, in full again: Look closer is there and has focus.
    await expect(page.getByRole('button', { name: 'Look closer' })).toBeFocused()
    await expect(factsButton(page)).toHaveCount(0)
    await page.getByRole('button', { name: 'Look closer' }).click()
    await expect(detailView(page)).toHaveAttribute('data-detail-status', 'ready', {
      timeout: 25_000,
    })
    await expect(factsButton(page)).toHaveAttribute('aria-expanded', 'false')
  })
})

test.describe('on a wide screen the sheet is unchanged (#205)', () => {
  test.use({ viewport: { width: 1920, height: 1080 } })

  test('there is no Facts button and the facts stay on the right', async ({ page }) => {
    await openDetailOf(page, 'Parker Solar Probe')
    await expect(page.getByRole('button', { name: 'Facts' })).toHaveCount(0)
    await expect(page.getByText('From the Sun', { exact: true })).toBeVisible()
  })
})

for (const size of SIZES) {
  test.describe(`at ${size.label}`, () => {
    test.use({ viewport: { width: size.width, height: size.height }, hasTouch: size.touch })

    for (const model of MODELS) {
      test(`${model.label}: the whole model is in the canvas at the default view and at the zoom-out limit, and nothing draws under the text`, async ({
        page,
      }) => {
        await openDetailOf(page, model.name)
        await expectNothingUnderTheText(page)
        await expectFitInside(page)
        await expectFills(page)
        // Zoom all the way out: the model only gets smaller. Wait for a frame at the limit.
        const startWidth = (await fitOf(page)).width
        const out = page.getByRole('button', { name: 'Zoom out' })
        for (let i = 0; i < 12; i += 1) await out.click()
        await expect.poll(async () => (await fitOf(page)).width).toBeLessThan(startWidth * 0.5)
        await expectFitInside(page)
        await expectNothingUnderTheText(page)
      })
    }
  })
}
