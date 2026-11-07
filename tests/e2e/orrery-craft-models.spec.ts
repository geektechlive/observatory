/**
 * Spacecraft silhouettes and 3D models (#115). /api/orrery-bodies is mocked with a few
 * craft moving in straight lines from their real 2026-11-06 states. Focusing a craft
 * loads its NASA model (or builds a simplified one); moving the focus disposes it.
 */
import { expect, type Page, test } from '@playwright/test'

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
  group: 'deep-space' | 'mission',
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
    group,
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
    track('-31', 'Voyager 1', 'deep-space', [-32.2, -137.1, 99.2], [-0.0012, -0.00786, 0.00568]),
    track('-96', 'Parker Solar Probe', 'mission', [0.2, 0.15, 0.01], [-0.01, 0.02, 0]),
    track('-255', 'Psyche', 'mission', [1.2, 1.3, 0.05], [-0.008, 0.007, 0]),
  ],
  missing: [],
}

const canvas = (page: Page) => page.locator('canvas[data-orrery-webgl]')
const stat = async (page: Page, name: string) =>
  Number((await canvas(page).getAttribute(`data-orrery-${name}`)) ?? 'NaN')

async function openOrrery(page: Page) {
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
  await expect(canvas(page)).toHaveAttribute('data-orrery-craft', '3')
}

async function focus(page: Page, name: string) {
  const search = page.getByRole('combobox', { name: /find/i })
  await search.fill(name)
  await page.getByRole('option', { name, exact: true }).click()
}

test('focusing Voyager 1 loads its NASA model, served as glTF, and a preset drops it', async ({
  page,
}) => {
  const models: { url: string; type: string }[] = []
  page.on('response', (r) => {
    if (r.url().includes('/models/craft/'))
      models.push({ url: r.url(), type: r.headers()['content-type'] ?? '' })
  })
  await openOrrery(page)
  // No model is fetched until a craft is focused.
  expect(models).toEqual([])
  await focus(page, 'Voyager 1')
  await expect(canvas(page)).toHaveAttribute('data-orrery-model', 'model:-31', { timeout: 15_000 })
  // A missing file would come back as the SPA's index.html with a 200 (the maplibre
  // worker lesson in CLAUDE.md): check what was actually served.
  expect(models.map((m) => new URL(m.url).pathname)).toEqual(['/models/craft/voyager.glb'])
  expect(models[0]?.type).not.toMatch(/html/)
  const inspector = page.getByRole('complementary', { name: 'Voyager 1' })
  await expect(inspector.getByRole('link', { name: /3D model: NASA/ })).toBeVisible()
  await page.getByRole('button', { name: 'Inner', exact: true }).click()
  await expect(canvas(page)).toHaveAttribute('data-orrery-model', '')
})

test('a craft with no NASA model gets a simplified model, without a download', async ({ page }) => {
  const models: string[] = []
  page.on('request', (r) => {
    if (r.url().includes('/models/craft/')) models.push(r.url())
  })
  await openOrrery(page)
  await focus(page, 'Psyche')
  await expect(canvas(page)).toHaveAttribute('data-orrery-model', 'simplified:-255')
  expect(models).toEqual([])
  await expect(page.getByText(/^Simplified model/)).toBeVisible()
})

test('switching the focused craft over and over leaves GPU objects and loops flat', async ({
  page,
}) => {
  test.setTimeout(90_000)
  await openOrrery(page)
  const cycle = async () => {
    for (const [name, state] of [
      ['Voyager 1', 'model:-31'],
      ['Psyche', 'simplified:-255'],
      ['Parker Solar Probe', 'model:-96'],
    ] as const) {
      await focus(page, name)
      await expect(canvas(page)).toHaveAttribute('data-orrery-model', state, { timeout: 15_000 })
    }
    await page.getByRole('button', { name: 'Inner', exact: true }).click()
    await expect(canvas(page)).toHaveAttribute('data-orrery-model', '')
  }
  // Two warm-up cycles: passing Mars and Mercury fetches their maps once (#105 keeps
  // them), which is a cache filling, not a leak.
  await cycle()
  await cycle()
  await page.waitForTimeout(1000)
  const base = {
    geometries: await stat(page, 'geometries'),
    textures: await stat(page, 'textures'),
  }
  for (let i = 0; i < 6; i += 1) await cycle()
  await page.waitForTimeout(1500)
  expect(await stat(page, 'geometries')).toBeLessThanOrEqual(base.geometries + 2)
  expect(await stat(page, 'textures')).toBeLessThanOrEqual(base.textures + 1)
  await expect(canvas(page)).toHaveAttribute('data-orrery-animating', 'false')
})
