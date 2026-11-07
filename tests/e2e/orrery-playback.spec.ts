/**
 * Faster playback (#114): a year a second really moves the clock about a year a second,
 * and ten seconds of it leave the frame loop and the GPU objects flat (the #91 lesson:
 * a moving clock must not multiply loops).
 */
import { expect, type Page, test } from '@playwright/test'

import { serveMoons } from './moonPayload'
import { offlineSun } from './swpc'

test.use({ viewport: { width: 1440, height: 900 } })
test.setTimeout(60_000)

test.beforeEach(async ({ page }) => {
  await offlineSun(page)
})

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
/** The readout's year as a fraction: "2026-11-07 14:05 UTC" → 2026.85. */
async function readoutYear(page: Page): Promise<number> {
  const text = (await page.locator('[aria-label="Simulation time"] output').textContent()) ?? ''
  const m = /^(-?\d+)-(\d{2})-(\d{2})/.exec(text)
  if (!m) throw new Error(`readout: ${text}`)
  return Number(m[1]) + (Number(m[2]) - 1) / 12 + (Number(m[3]) - 1) / 365
}

async function open(page: Page) {
  await wrapRaf(page)
  await serveMoons(page)
  await page.goto('/#orrery')
  await expect(page.locator('[data-orrery-mode]')).toHaveAttribute('data-orrery-mode', 'webgl', {
    timeout: 20_000,
  })
}

test('1 yr/s advances the readout by about a year a second', async ({ page }) => {
  await open(page)
  const before = await readoutYear(page)
  // Click latency under a loaded full run reached seconds (#115: 3.76 years read against
  // a 5.4 s window). The clock surely ran at 1 yr/s from the rate click's return to the
  // Pause click, and at most from before the first click to after the second.
  const started = Date.now()
  await page.getByRole('radio', { name: '1 yr/s' }).click()
  const running = Date.now()
  await page.waitForTimeout(3000)
  const pausing = Date.now()
  await page.getByRole('button', { name: 'Pause' }).click()
  const stopped = Date.now()
  const years = (await readoutYear(page)) - before
  expect(years).toBeGreaterThan(((pausing - running) / 1000) * 0.9)
  expect(years).toBeLessThan(((stopped - started) / 1000) * 1.1)
})

test('ten seconds at 1 yr/s leave loops, draws and GPU objects flat, and say what hid', async ({
  page,
}) => {
  await open(page)
  await page.getByRole('button', { name: 'Outer', exact: true }).click()
  await page.waitForTimeout(800)
  const base = {
    geometries: await stat(page, 'geometries'),
    programs: await stat(page, 'programs'),
  }
  await page.getByRole('radio', { name: '1 yr/s' }).click()
  for (let i = 0; i < 10; i += 1) {
    await page.waitForTimeout(1000)
    expect(
      await page.evaluate(() => (window as unknown as { rafPending: () => number }).rafPending()),
    ).toBeLessThanOrEqual(3)
  }
  // The moons' data spans a few days: past them the stage says so.
  await expect(page.locator('[data-orrery-nodata]')).toContainText('no data for this date')
  expect(await stat(page, 'geometries')).toBeLessThanOrEqual(base.geometries + 2)
  expect(await stat(page, 'programs')).toBe(base.programs)
  // Paused, the loop stops.
  await page.getByRole('button', { name: 'Pause' }).click()
  await expect(canvas(page)).toHaveAttribute('data-orrery-animating', 'false')
  const drawsBefore = await stat(page, 'draws')
  await page.waitForTimeout(1500)
  expect((await stat(page, 'draws')) - drawsBefore).toBeLessThanOrEqual(2)
})
