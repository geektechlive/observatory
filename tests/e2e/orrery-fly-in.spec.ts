/**
 * The fly-in (#261, #268): with ESA DISCOS sizes for a craft, "Look closer" happens in the
 * orrery itself. It eases to true scale, then flies in to the model at its real size, on the
 * orrery's own canvas with the rail still there, and Back, Escape or a push out at the wall
 * flies back out to the scale and view the visitor had. Reduced motion cuts. Without DISCOS
 * sizes the close-up stays the studio "Look closer". /api/orrery-bodies and /api/discos are
 * mocked.
 */
import { expect, type Page, test } from '@playwright/test'

import { offlineSun } from './swpc'

test.use({ viewport: { width: 1440, height: 900 } })

const DAY_MS = 86_400_000
const JD_UNIX = 2440587.5
const jdNow = () => Math.floor(Date.now() / DAY_MS) + JD_UNIX

function track(naifId: string, name: string, pos: [number, number, number]) {
  const start = jdNow() - 30
  const fine: number[] = []
  for (let i = 0; i <= 60; i += 1) fine.push(...pos, 0, 0, 0)
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

const BODIES = {
  generatedAt: new Date().toISOString(),
  coarseFetchedAt: new Date().toISOString(),
  frame: 'ecliptic-J2000',
  center: 'Sun',
  timeScale: 'TDB',
  units: { position: 'au', velocity: 'au/day' },
  sourceType: 'ephemeris',
  provider: 'jpl-horizons',
  bodies: [
    track('-96', 'Parker Solar Probe', [0.2, 0.15, 0.01]),
    track('-31', 'Voyager 1', [-30, 120, 60]),
  ],
  missing: [],
}

function discosObject(o: Record<string, unknown>) {
  return {
    cosparId: null,
    satno: null,
    name: 'x',
    objectClass: null,
    massKg: null,
    shape: null,
    widthM: null,
    heightM: null,
    depthM: null,
    diameterM: null,
    spanM: null,
    xSectMaxM2: null,
    operators: [],
    firstEpoch: null,
    fetchedAt: new Date().toISOString(),
    ...o,
  }
}

async function serve(page: Page) {
  await offlineSun(page)
  await page.route('**/api/orrery-bodies', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(BODIES) }),
  )
  // Parker has sizes; Voyager 1 has none, so it keeps the studio view.
  await page.route('**/api/discos', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        generatedAt: new Date().toISOString(),
        citation: 'ESA DISCOS (DISCOSweb)',
        craft: {
          '-96': discosObject({ name: 'Parker Solar Probe', diameterM: 2.3, heightM: 3, spanM: 3 }),
        },
        satellites: {},
        missing: [],
      }),
    }),
  )
}

const orrery = (page: Page) => page.locator('canvas[data-orrery-webgl]')
const overlay = (page: Page) => page.locator('[data-fly-in]')
const studio = (page: Page) => page.locator('[data-detail-view]')
/** The fly-in's phase on the orrery's canvas: '', waiting, enter, arrived or leave. */
const phase = async (page: Page) => (await orrery(page).getAttribute('data-orrery-fly')) ?? ''
/** The camera's range to the craft in the fly-in, km. */
const rangeKm = async (page: Page) =>
  Number((await orrery(page).getAttribute('data-orrery-fly-km')) || Number.NaN)

async function open(page: Page, naif: string) {
  await serve(page)
  await page.goto(`/orrery/#focus=naif:${naif}&detail=1`)
  await expect(overlay(page)).toBeVisible({ timeout: 20_000 })
}

test('Parker flies in inside the orrery, on its one canvas, to its real size', async ({ page }) => {
  await open(page, '-96')
  // No second canvas: the orrery draws the fly-in, and the rail stays.
  await expect(page.locator('canvas[data-detail-canvas]')).toHaveCount(0)
  await expect(page.locator('[data-orrery-page] [class*="rail"]').first()).toBeVisible()
  await expect(page.locator('[data-fly-badge]')).toHaveText('TRUE SCALE')
  // A 3 m body and a 3 m span: the body is scaled, a robust radius of 1.5 m.
  await expect(orrery(page)).toHaveAttribute('data-orrery-fly-model-m', '1.5000', {
    timeout: 10_000,
  })
  // Early on the camera is still far out.
  await expect.poll(() => rangeKm(page), { timeout: 5_000 }).toBeGreaterThan(1_000)
  // About five seconds later it has arrived, a few hundred metres off.
  await expect.poll(() => phase(page), { timeout: 10_000 }).toBe('arrived')
  expect(await rangeKm(page)).toBeLessThan(2)
  await expect(orrery(page)).toHaveAttribute('data-orrery-fly-true', '1.00')
})

/** The direction from the camera's target to the camera (data-orrery-camera's offset). */
const viewDir = async (page: Page) => {
  const [x = 0, y = 0, z = 0] = ((await orrery(page).getAttribute('data-orrery-camera')) ?? '')
    .split(',')
    .map(Number)
  const n = Math.hypot(x, y, z)
  return [x / n, y / n, z / n] as const
}
const angleDeg = (a: readonly number[], b: readonly number[]) =>
  (Math.acos(
    Math.min(1, (a[0] ?? 0) * (b[0] ?? 0) + (a[1] ?? 0) * (b[1] ?? 0) + (a[2] ?? 0) * (b[2] ?? 0)),
  ) *
    180) /
  Math.PI

test('it keeps the visitor’s angle: straight in and straight back out, no swing', async ({
  page,
}) => {
  await serve(page)
  await page.goto('/orrery/#focus=naif:-96')
  await expect(orrery(page)).toHaveAttribute('data-orrery-focus', 'naif:-96', { timeout: 20_000 })
  await page.waitForTimeout(1_500) // the focus flight
  const before = await viewDir(page)
  await page.getByRole('button', { name: 'Look closer' }).click()
  await expect.poll(() => phase(page), { timeout: 10_000 }).toBe('arrived')
  expect(angleDeg(before, await viewDir(page))).toBeLessThan(1)
  await page.keyboard.press('Escape')
  await expect.poll(() => phase(page), { timeout: 8_000 }).toBe('')
  expect(angleDeg(before, await viewDir(page))).toBeLessThan(1)
})

test('a target bracket and range mark the craft while it is too small to see', async ({ page }) => {
  await open(page, '-96')
  const target = page.locator('[data-fly-target]')
  await expect.poll(() => phase(page), { timeout: 5_000 }).toBe('enter')
  // Far out the craft is under a pixel: the bracket at full strength with a km range.
  await expect(target).toHaveCSS('opacity', '1', { timeout: 5_000 })
  await expect(target).toContainText(/km$/)
  // At arrival the model fills the view and the bracket has faded out.
  await expect.poll(() => phase(page), { timeout: 10_000 }).toBe('arrived')
  await expect(target).toHaveCSS('opacity', '0')
  expect(Number(await target.getAttribute('data-fly-target-radius'))).toBeGreaterThan(40)
})

test('with reduced motion there is no flight: the camera is at arrival at once', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(page, '-96')
  await expect.poll(() => phase(page), { timeout: 3_000 }).toBe('arrived')
  expect(await rangeKm(page)).toBeLessThan(2)
})

test('Escape flies back out to the scale and view the visitor had', async ({ page }) => {
  await serve(page)
  await page.goto('/orrery/#focus=naif:-96')
  await expect(orrery(page)).toHaveAttribute('data-orrery-focus', 'naif:-96', { timeout: 20_000 })
  await page.waitForTimeout(1_500) // the focus flight
  const before = await orrery(page).getAttribute('data-orrery-sizes')
  await page.getByRole('button', { name: 'Look closer' }).click()
  await expect.poll(() => phase(page), { timeout: 10_000 }).toBe('arrived')
  await page.keyboard.press('Escape')
  await expect(overlay(page)).toHaveCount(0)
  await expect.poll(() => phase(page), { timeout: 8_000 }).toBe('')
  await expect(page.locator('[data-orrery-page] p[data-label-obstacle]').first()).toHaveText(
    'NOT TO SCALE',
  )
  // Back at Big bodies, from where it was: the bodies draw as large as before.
  await expect.poll(() => orrery(page).getAttribute('data-orrery-sizes')).toBe(before)
  await expect(page.getByRole('button', { name: 'Look closer' })).toBeFocused()
  await expect(page).not.toHaveURL(/detail=1/)
})

test('flying in and back three times leaves nothing more on the GPU', async ({ page }) => {
  test.setTimeout(90_000)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await serve(page)
  await page.goto('/orrery/#focus=naif:-96')
  await expect(orrery(page)).toHaveAttribute('data-orrery-model', 'model:-96', { timeout: 20_000 })
  const look = page.getByRole('button', { name: 'Look closer' })
  const counts = async () =>
    [
      await orrery(page).getAttribute('data-orrery-geometries'),
      await orrery(page).getAttribute('data-orrery-textures'),
    ].join(',')
  // One round first: the stars and the sky's maps load on the first fly-in and then stay.
  await look.click()
  await expect.poll(() => phase(page), { timeout: 10_000 }).toBe('arrived')
  await overlay(page).getByRole('button', { name: 'Back to orrery' }).click()
  await expect.poll(() => phase(page), { timeout: 8_000 }).toBe('')
  const settled = await counts()
  for (let i = 0; i < 3; i += 1) {
    await look.click()
    await expect.poll(() => phase(page), { timeout: 10_000 }).toBe('arrived')
    await overlay(page).getByRole('button', { name: 'Back to orrery' }).click()
    await expect.poll(() => phase(page), { timeout: 8_000 }).toBe('')
  }
  await expect.poll(counts).toBe(settled)
})

test('a preset during the fly-in ends it and closes the close-up', async ({ page }) => {
  await open(page, '-96')
  await expect.poll(() => phase(page), { timeout: 10_000 }).not.toBe('waiting')
  await page.getByRole('button', { name: 'Inner', exact: true }).click()
  await expect(overlay(page)).toHaveCount(0)
  expect(await phase(page)).toBe('')
  await expect(page).not.toHaveURL(/detail=1/)
})

/** One wheel gesture: `n` events of `dy` px, 16 ms apart, then the gesture gap. */
async function wheelGesture(page: Page, n: number, dy: number) {
  for (let i = 0; i < n; i += 1) {
    await page.mouse.wheel(0, dy)
    await page.waitForTimeout(16)
  }
  await page.waitForTimeout(700)
}

test('zooming in past the closest zoom on a craft flies in (#261)', async ({ page }) => {
  await serve(page)
  await page.goto('/orrery/#focus=naif:-96')
  await expect(orrery(page)).toHaveAttribute('data-orrery-focus', 'naif:-96', { timeout: 20_000 })
  await page.waitForTimeout(1_500) // the focus flight
  const box = await orrery(page).boundingBox()
  if (!box) throw new Error('no canvas')
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.3)
  // The gesture that carries the camera to its closest zoom never crosses (its tail is momentum).
  await wheelGesture(page, 60, -100)
  await expect(overlay(page)).toHaveCount(0)
  // A fresh push at the limit does.
  await wheelGesture(page, 8, -100)
  await expect(overlay(page)).toBeVisible({ timeout: 20_000 })
  // The rest of the crossing gesture was swallowed, so the flight still runs from far out.
  await expect.poll(() => phase(page), { timeout: 5_000 }).toBe('enter')
  await expect(page).toHaveURL(/detail=1/)
})

test('zooming out at the fly-in’s wall flies back out', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open(page, '-96')
  await expect.poll(() => phase(page), { timeout: 5_000 }).toBe('arrived')
  const box = await orrery(page).boundingBox()
  if (!box) throw new Error('no canvas')
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.4)
  // Out to the wall (the model about 12 px): that gesture stops there.
  await wheelGesture(page, 120, 100)
  expect(await phase(page)).toBe('arrived')
  // A fresh push out there goes back.
  await wheelGesture(page, 8, 100)
  await expect(overlay(page)).toHaveCount(0)
  await expect.poll(() => phase(page), { timeout: 8_000 }).toBe('')
})

test('zooming in on a planet never flies in', async ({ page }) => {
  await serve(page)
  await page.goto('/orrery/#focus=Mars')
  await expect(orrery(page)).toHaveAttribute('data-orrery-focus', 'Mars', { timeout: 20_000 })
  await page.waitForTimeout(1_500)
  const box = await orrery(page).boundingBox()
  if (!box) throw new Error('no canvas')
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.3)
  await wheelGesture(page, 60, -100)
  await wheelGesture(page, 20, -100)
  await expect(overlay(page)).toHaveCount(0)
  expect(await phase(page)).toBe('')
})

test.describe('on a touch screen (390 x 844)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

  /** One two-finger pinch through Chrome's touch input: spread `from` to `to` px, in steps. */
  async function pinchOut(page: Page, from: number, to: number) {
    const box = await orrery(page).boundingBox()
    if (!box) throw new Error('no canvas')
    // On a phone the inspector sheet covers the lower stage: pinch in the band above it, on a
    // row where both fingers start clear of labels and buttons. Chrome's touch adjustment
    // snaps a touch onto a button a few px away, and a label moves with the bodies.
    const cx = box.x + box.width / 2
    const clear = (y: number) =>
      page.evaluate(
        ([x0, x1, yy]) =>
          [x0, x1].every((x) =>
            [-15, 0, 15].every((dx) =>
              [-15, 0, 15].every(
                (dy) =>
                  document.elementFromPoint((x ?? 0) + dx, (yy ?? 0) + dy)?.tagName === 'CANVAS',
              ),
            ),
          ),
        [cx - from / 2, cx + from / 2, y],
      )
    let cy: number | null = null
    for (let y = box.y + 60; y <= box.y + 260 && cy === null; y += 10) {
      if (await clear(y)) cy = y
    }
    expect(cy, 'a row on the stage where both fingers start on the canvas').not.toBeNull()
    const row = cy ?? 0
    const at = (d: number) => [
      { x: cx - d / 2, y: row, id: 0 },
      { x: cx + d / 2, y: row, id: 1 },
    ]
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: at(from) })
    const steps = 20
    for (let i = 1; i <= steps; i += 1) {
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: at(from + ((to - from) * i) / steps),
      })
      await page.waitForTimeout(16)
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }

  test('pinching out past the closest zoom on a craft flies in (#261)', async ({ page }) => {
    await serve(page)
    await page.goto('/orrery/#focus=naif:-96')
    await expect(orrery(page)).toHaveAttribute('data-orrery-focus', 'naif:-96', {
      timeout: 20_000,
    })
    await page.waitForTimeout(1_500) // the focus flight
    // A pinch that carries the camera to its closest zoom never crosses. Under load the
    // focus flight may not be over, so it can take more than one to get there.
    for (let i = 0; i < 4; i += 1) {
      await pinchOut(page, 40, 340)
      await expect(overlay(page)).toHaveCount(0)
      await page.waitForTimeout(500) // the zoom eases on (damping)
      if ((await orrery(page).getAttribute('data-orrery-closest')) === 'naif:-96') break
    }
    await expect(orrery(page)).toHaveAttribute('data-orrery-closest', 'naif:-96')
    // A fresh pinch at the limit does.
    await pinchOut(page, 60, 260)
    await expect(overlay(page)).toBeVisible({ timeout: 20_000 })
    await expect(page).toHaveURL(/detail=1/)
  })

  test('pinching out on a planet never flies in', async ({ page }) => {
    await serve(page)
    await page.goto('/orrery/#focus=Mars')
    await expect(orrery(page)).toHaveAttribute('data-orrery-focus', 'Mars', { timeout: 20_000 })
    await page.waitForTimeout(1_500)
    await pinchOut(page, 40, 340)
    await pinchOut(page, 60, 260)
    await expect(overlay(page)).toHaveCount(0)
  })
})

test('a craft without DISCOS sizes keeps the studio close-up', async ({ page }) => {
  await serve(page)
  await page.goto('/orrery/#focus=naif:-31&detail=1')
  await expect(studio(page)).toHaveAttribute('data-detail-status', 'ready', { timeout: 20_000 })
  await expect(overlay(page)).toHaveCount(0)
  // The studio has its own canvas; the orrery's steps off the page meanwhile.
  await expect(page.locator('canvas[data-detail-canvas]')).toHaveCount(1)
  await expect(orrery(page)).toHaveCount(0)
})
