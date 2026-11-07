/**
 * The orrery must not slow down with use (#91). Chris's report: fine at first, slower
 * after switching presets, dragging and pinching. The cause was frame loops multiplying:
 * each camera move scheduled a second requestAnimationFrame, and a 1x clock kept every
 * loop alive (30 cycles left 12,361 pending; 3 million draws). This soak asserts the
 * counts stay flat, drags cause no React renders, and the loop stops when idle.
 */
import { expect, type Page, test } from '@playwright/test'

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(120_000)

/** Count requestAnimationFrame callbacks waiting to run: each live loop holds one. */
async function wrapRaf(page: Page) {
  await page.addInitScript(() => {
    const pending = new Set<number>()
    const raf = window.requestAnimationFrame.bind(window)
    const caf = window.cancelAnimationFrame.bind(window)
    window.requestAnimationFrame = (cb) => {
      const id = raf((t) => {
        pending.delete(id)
        cb(t)
      })
      pending.add(id)
      return id
    }
    window.cancelAnimationFrame = (id) => {
      pending.delete(id)
      caf(id)
    }
    ;(window as unknown as { rafPending: () => number }).rafPending = () => pending.size
  })
}

const canvas = (page: Page) => page.locator('canvas[data-orrery-webgl]')
const stat = async (page: Page, name: string) =>
  Number((await canvas(page).getAttribute(`data-orrery-${name}`)) ?? 'NaN')
const renders = async (page: Page) =>
  Number((await page.locator('[data-orrery-page]').getAttribute('data-orrery-renders')) ?? 0)
const rafPending = (page: Page) =>
  page.evaluate(() => (window as unknown as { rafPending: () => number }).rafPending())

async function drag(page: Page, x: number, y: number) {
  await page.mouse.move(x, y)
  await page.mouse.down()
  for (let i = 1; i <= 6; i += 1) await page.mouse.move(x + i * 14, y + i * 5)
  await page.mouse.up()
}

test('preset, drag, zoom and search cycles leave loops, listeners and GPU objects flat', async ({
  page,
}) => {
  await wrapRaf(page)
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable')
  const metric = async (name: string) => {
    const { metrics } = await cdp.send('Performance.getMetrics')
    return metrics.find((m) => m.name === name)?.value ?? NaN
  }

  await page.goto('/#orrery')
  await expect(page.locator('[data-orrery-mode]')).toHaveAttribute('data-orrery-mode', 'webgl', {
    timeout: 20_000,
  })
  const box = await canvas(page).boundingBox()
  const x = (box?.x ?? 0) + (box?.width ?? 0) * 0.4
  const y = (box?.y ?? 0) + (box?.height ?? 0) * 0.5

  const cycle = async (i: number) => {
    await page.getByRole('button', { name: 'Inner', exact: true }).click()
    await page.getByRole('button', { name: 'Outer', exact: true }).click()
    await drag(page, x, y)
    await page.mouse.move(x, y)
    await page.mouse.wheel(0, i % 2 ? 120 : -120)
    const search = page.getByRole('combobox', { name: /find/i })
    await search.fill(i % 2 ? 'mars' : 'saturn')
    await search.press('Enter')
    await page.getByRole('button', { name: 'Close', exact: true }).click()
  }

  await cycle(0)
  await page.waitForTimeout(1500)
  const base = {
    listeners: await metric('JSEventListeners'),
    nodes: await metric('Nodes'),
    geometries: await stat(page, 'geometries'),
    programs: await stat(page, 'programs'),
  }

  for (let i = 1; i <= 20; i += 1) {
    await cycle(i)
    expect(await rafPending(page)).toBeLessThanOrEqual(3)
  }
  await page.waitForTimeout(2500)

  // Nothing accumulated: frame loops, listeners, DOM, GPU objects.
  expect(await rafPending(page)).toBeLessThanOrEqual(2)
  expect(await metric('JSEventListeners')).toBeLessThanOrEqual(base.listeners * 1.25)
  expect(await metric('Nodes')).toBeLessThanOrEqual(base.nodes * 1.25)
  expect(await stat(page, 'geometries')).toBeLessThanOrEqual(base.geometries + 2)
  expect(await stat(page, 'programs')).toBe(base.programs)

  // Idle: the loop has stopped; the 1x clock wakes it about once a second at most.
  await expect(canvas(page)).toHaveAttribute('data-orrery-animating', 'false')
  const drawsBefore = await stat(page, 'draws')
  await page.waitForTimeout(2000)
  expect((await stat(page, 'draws')) - drawsBefore).toBeLessThanOrEqual(3)
})

test('dragging and zooming the camera does not re-render the page', async ({ page }) => {
  // Settle the page's network first (#93: the spacecraft and DSN fetches). Unanswered,
  // the spacecraft fetch retries with backoff inside the measured window, and each
  // retry renders the page: that is the network, not the drags this test is about.
  await page.route('**/api/orrery-bodies', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"test"}' }),
  )
  await page.route('https://eyes.nasa.gov/dsn/data/dsn.xml*', (route) =>
    route.fulfill({ status: 200, contentType: 'text/xml', body: '<dsn></dsn>' }),
  )
  await page.goto('/#orrery')
  await expect(page.locator('[data-orrery-mode]')).toHaveAttribute('data-orrery-mode', 'webgl', {
    timeout: 20_000,
  })
  // Retries exhausted (the page then shows why there are no craft).
  await expect(page.getByText('Spacecraft positions are unavailable right now.')).toBeVisible({
    timeout: 20_000,
  })
  await page.waitForTimeout(500)
  const box = await canvas(page).boundingBox()
  const x = (box?.x ?? 0) + (box?.width ?? 0) * 0.4
  const y = (box?.y ?? 0) + (box?.height ?? 0) * 0.5
  const before = await renders(page)
  const started = Date.now()
  for (let i = 0; i < 10; i += 1) {
    await drag(page, x, y)
    await page.mouse.wheel(0, i % 2 ? 120 : -120)
  }
  const seconds = (Date.now() - started) / 1000
  // The page refreshes once a second for its voice line; drags themselves add nothing.
  expect((await renders(page)) - before).toBeLessThanOrEqual(Math.ceil(seconds) + 2)
})
