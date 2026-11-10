/**
 * Marker sizes against the Sun (#195, #196), measured from the renderer's own projected
 * radii (`data-orrery-px`, written only when a test sets the attribute). Zoomed into
 * Earth the Sun is at its px floor; nothing sized as a share of Earth may outgrow it.
 * In every scale mode the Sun stays above a craft icon.
 */
import { expect, type Page, test } from '@playwright/test'

import { serveCraft } from './craftPayload'
import { serveMoons } from './moonPayload'
import { serveNeo } from './neoPayload'
import { serveSats } from './satPayload'
import { serveSpaceTrack } from './spaceTrackPayload'
import { offlineSun } from './swpc'

test.beforeEach(async ({ page }) => {
  await offlineSun(page)
})

interface Px {
  sun: number | null
  craft: number | null
  moon: number | null
  l1: number | null
  asteroid: number | null
  satMarker: number | null
  satReentry: number | null
}

async function openOrrery(page: Page, withCraft = false) {
  await (withCraft ? serveCraft(page) : serveMoons(page))
  await serveNeo(page)
  await serveSats(page)
  await serveSpaceTrack(page)
  await page.goto('/#orrery')
  await expect(page.locator('[data-orrery-mode]')).toHaveAttribute('data-orrery-mode', 'webgl', {
    timeout: 20_000,
  })
  await canvas(page).evaluate((el) => {
    el.setAttribute('data-orrery-px', '')
  })
}

const canvas = (page: Page) => page.locator('canvas[data-orrery-webgl]')

async function readPx(page: Page): Promise<Px> {
  const raw = (await canvas(page).getAttribute('data-orrery-px')) ?? ''
  return raw
    ? (JSON.parse(raw) as Px)
    : {
        sun: null,
        craft: null,
        moon: null,
        l1: null,
        asteroid: null,
        satMarker: null,
        satReentry: null,
      }
}

async function zoomIn(page: Page) {
  const box = await canvas(page).boundingBox()
  if (!box) throw new Error('no canvas')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let i = 0; i < 10; i += 1) {
    await page.mouse.wheel(0, -250)
    await page.waitForTimeout(100)
  }
}

test.describe('marker sizes against the Sun (#195, #196)', () => {
  test.use({ viewport: { width: 1920, height: 1080 } })

  for (const preset of ['Earth–Moon', 'Earth orbit'] as const) {
    test(`${preset}, zoomed in: no marker outgrows the Sun`, async ({ page }) => {
      await openOrrery(page)
      await page.getByRole('button', { name: preset, exact: true }).click()
      await page.getByRole('switch', { name: 'Starlink' }).click()
      await page.getByRole('combobox', { name: /find/i }).fill('ISS')
      await page.getByRole('option', { name: /^ISS/ }).first().click()
      await zoomIn(page)
      await expect.poll(async () => (await readPx(page)).sun).not.toBeNull()
      await expect
        .poll(async () => {
          const px = await readPx(page)
          return [px.moon, px.l1, px.asteroid, px.satMarker, px.satReentry].filter(
            (v) => v !== null,
          ).length
        })
        .toBeGreaterThan(0)
      const px = await readPx(page)
      const sun = px.sun ?? 0
      for (const key of ['moon', 'l1', 'asteroid', 'satMarker', 'satReentry'] as const) {
        const value = px[key]
        if (value !== null) expect(value, `${key} px against the Sun`).toBeLessThanOrEqual(sun)
      }
    })
  }

  for (const [scale, view] of [
    ['Log distance', 'Heliosphere'],
    ['Proportional', 'Inner'],
  ] as const) {
    test(`${scale}: the Sun draws bigger than a spacecraft icon`, async ({ page }) => {
      await openOrrery(page, true)
      await page.getByRole('button', { name: scale, exact: true }).click()
      await page.getByRole('button', { name: view, exact: true }).click()
      await expect
        .poll(async () => {
          const px = await readPx(page)
          return px.craft !== null && px.sun !== null
        })
        .toBe(true)
      const px = await readPx(page)
      expect(px.sun ?? 0).toBeGreaterThan(px.craft ?? Infinity)
    })
  }
})
