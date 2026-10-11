/**
 * The three.js globe and its fallbacks (#46, #47). Every assertion reads
 * data-globe-mode: a canvas existing proves nothing, and without it every spec here
 * could pass silently on the SVG fallback (Codex finding 8).
 */
import { createRequire } from 'node:module'

import { expect, type Page, test } from '@playwright/test'

const require = createRequire(import.meta.url)
// sharp ships with the toolchain; used only to measure the rendered canvas.
const sharp = require('sharp') as (input: Buffer) => {
  stats: () => Promise<{ channels: { stdev: number }[] }>
}

const host = (page: Page) => page.locator('[data-globe-mode]')

test.describe('Globe host', () => {
  test('stays on the SVG globe by default until parity (#44)', async ({ page }) => {
    await page.goto('/')
    await expect(host(page)).toHaveAttribute('data-globe-mode', 'svg')
    await page.waitForTimeout(2500) // past the idle upgrade window
    await expect(host(page)).toHaveAttribute('data-globe-mode', 'svg')
    await expect(page.locator('canvas[data-globe-webgl]')).toHaveCount(0)
  })

  test('?globe=webgl upgrades to a rendered three.js Earth', async ({ page }) => {
    await page.goto('/?globe=webgl')
    await expect(host(page)).toHaveAttribute('data-globe-mode', 'webgl', { timeout: 15_000 })
    await expect(page.getByRole('group', { name: /Orthographic globe/ })).toBeVisible()
    await page.waitForTimeout(500) // let the crossfade finish
    const png = await page.locator('canvas[data-globe-webgl]').screenshot()
    const { channels } = await sharp(png).stats()
    // A blank or single-colour canvas has ~0 deviation; a textured Earth does not.
    expect(Math.max(...channels.slice(0, 3).map((c) => c.stdev))).toBeGreaterThan(8)
  })

  test('falls back to SVG when a texture fails to load', async ({ page }) => {
    await page.route('**/textures/**', (route) => route.abort())
    await page.goto('/?globe=webgl')
    await page.waitForTimeout(4000)
    await expect(host(page)).toHaveAttribute('data-globe-mode', 'svg')
    await expect(page.getByRole('group', { name: /Orthographic globe/ })).toBeVisible()
  })

  test('falls back to SVG when the renderer chunk fails to load', async ({ page }) => {
    await page.route('**/assets/GlobeRenderer-*.js', (route) => route.abort())
    await page.goto('/?globe=webgl')
    await page.waitForTimeout(4000)
    await expect(host(page)).toHaveAttribute('data-globe-mode', 'svg')
  })

  test('falls back to SVG when the GPU context is lost', async ({ page }) => {
    await page.goto('/?globe=webgl')
    await expect(host(page)).toHaveAttribute('data-globe-mode', 'webgl', { timeout: 15_000 })
    await page.locator('canvas[data-globe-webgl]').evaluate((canvas) => {
      const gl = (canvas as HTMLCanvasElement).getContext('webgl2')
      gl?.getExtension('WEBGL_lose_context')?.loseContext()
    })
    await expect(host(page)).toHaveAttribute('data-globe-mode', 'svg')
  })

  test('switching Earth and Sun repeatedly keeps one canvas (no context churn)', async ({
    page,
  }) => {
    await page.goto('/?globe=webgl')
    await expect(host(page)).toHaveAttribute('data-globe-mode', 'webgl', { timeout: 15_000 })
    for (let i = 0; i < 5; i++) {
      await page.getByRole('tab', { name: /SUN/ }).click()
      await page.getByRole('tab', { name: /EARTH/ }).click()
      await expect(host(page)).toHaveAttribute('data-globe-mode', 'webgl', { timeout: 10_000 })
    }
    await expect(page.locator('canvas[data-globe-webgl]')).toHaveCount(1)
  })
})
