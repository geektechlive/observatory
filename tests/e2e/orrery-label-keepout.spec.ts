/**
 * Labels and rim markers keep off each other and off the stage's furniture (#160, #132),
 * and crowded views still name what fits (#131, #127, #130). /api/orrery-bodies answers
 * with Earth, the Moon, the moons and Voyager 1 (a rim marker outside Heliosphere), and
 * /api/orrery-neo with four close approaches.
 */
import { expect, type Page, test } from '@playwright/test'

import { moonPayload } from './moonPayload'
import { serveNeo } from './neoPayload'
import { offlineSun } from './swpc'
import { voyager1 } from './voyagerPayload'

const DAY_MS = 86_400_000
const JD_UNIX = 2440587.5
const AU_KM = 149_597_870.7
/** Today 12:00 UTC: a link with `t` opens paused, so the scene holds still. */
const NOON_MS = Math.floor(Date.now() / DAY_MS) * DAY_MS + DAY_MS / 2
const NOON_ISO = new Date(NOON_MS).toISOString()
const NOON_JD = NOON_MS / DAY_MS + JD_UNIX

/**
 * Jupiter's four big moons at fixed angles at today's noon, so the cluster looks the same
 * every day (moonPayload's phases follow the calendar, and on some days Callisto had a
 * free slot and on others not).
 */
function jovianMoons(phasesDeg: readonly [number, number, number, number]) {
  const moons = [
    ['501', 'Io', 422_000, 1.77],
    ['502', 'Europa', 671_000, 3.55],
    ['503', 'Ganymede', 1_070_000, 7.155],
    ['504', 'Callisto', 1_883_000, 16.691],
  ] as const
  const start = NOON_JD - 3
  const step = 1 / 24
  return moons.map(([naifId, name, km, period], k) => {
    const r = km / AU_KM
    const w = (2 * Math.PI) / period
    const samples: number[] = []
    for (let i = 0; i <= 6 * 24; i += 1) {
      const a = ((phasesDeg[k] ?? 0) * Math.PI) / 180 + w * (start + i * step - NOON_JD)
      samples.push(
        r * Math.cos(a),
        r * Math.sin(a),
        0,
        -r * w * Math.sin(a),
        r * w * Math.cos(a),
        0,
      )
    }
    return {
      id: `naif:${naifId}`,
      naifId,
      name,
      parent: { naifId: '599', name: 'Jupiter' },
      center: '500@599',
      target: `${name} (${naifId})`,
      periodDays: period,
      semiMajorAxisKm: km,
      fine: { start, step, samples },
    }
  })
}

async function open(page: Page, hash: string, moons?: ReturnType<typeof jovianMoons>) {
  await offlineSun(page)
  await serveNeo(page)
  const base = moonPayload()
  const body = JSON.stringify({
    ...base,
    bodies: [...base.bodies, voyager1()],
    ...(moons ? { moons } : {}),
  })
  await page.route('**/api/orrery-bodies', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body }),
  )
  await page.goto(`/${hash}`)
  await expect(page.locator('[data-orrery-mode]')).toHaveAttribute('data-orrery-mode', 'webgl', {
    timeout: 20_000,
  })
}

interface Found {
  text: string
  rim: string
  furniture: boolean
  l: number
  t: number
  r: number
  b: number
}

/** The stage's furniture: the badge and the guide chip (#118, #160). */
const BADGE_AND_CHIP = '[data-label-obstacle]'

/** Every shown label and rim marker, and every piece of stage furniture, as boxes. */
async function boxes(page: Page, furnitureSelector: string): Promise<Found[]> {
  return page.evaluate((selector) => {
    const root = document.querySelector('[data-orrery-page]')
    if (!root) return []
    const rect = (el: Element) => {
      const r = el.getBoundingClientRect()
      return { l: r.left, t: r.top, r: r.right, b: r.bottom }
    }
    const labels = [
      ...root.querySelectorAll<HTMLElement>('[role="group"][aria-label="Bodies"] button'),
    ]
      .filter((b) => !b.hidden && b.getBoundingClientRect().width > 0)
      .map((b) => ({
        text: b.textContent,
        rim: b.dataset['rim'] ?? '',
        furniture: false,
        ...rect(b),
      }))
    const furniture = [...root.querySelectorAll<HTMLElement>(selector)]
      .filter((e) => e.getBoundingClientRect().width > 0 && getComputedStyle(e).display !== 'none')
      .map((e) => ({ text: e.textContent.slice(0, 30), rim: '', furniture: true, ...rect(e) }))
    return [...labels, ...furniture]
  }, furnitureSelector)
}

/** Pairs that overlap, furniture with furniture excepted. */
async function collisions(
  page: Page,
  which: (a: Found, b: Found) => boolean,
  furnitureSelector = BADGE_AND_CHIP,
) {
  const all = await boxes(page, furnitureSelector)
  const out: string[] = []
  for (let i = 0; i < all.length; i += 1) {
    for (let j = i + 1; j < all.length; j += 1) {
      const a = all[i]
      const b = all[j]
      if (!a || !b || (a.furniture && b.furniture) || !which(a, b)) continue
      // 1 px of slack: rounding at the boxes' edges.
      if (a.l < b.r - 1 && a.r > b.l + 1 && a.t < b.b - 1 && a.b > b.t + 1) {
        out.push(`${a.text} × ${b.text}`)
      }
    }
  }
  return out
}

const rimOrFurniture = (a: Found, b: Found) =>
  (a.rim !== '' || b.rim !== '') && (a.furniture || b.furniture || (a.rim !== '' && b.rim !== ''))

/** Any pair with a rim marker or a piece of furniture in it (#132). */
const touchesRimOrFurniture = (a: Found, b: Found) =>
  a.rim !== '' || b.rim !== '' || a.furniture || b.furniture

const RIM_MARKER = '[data-orrery-page] button[data-kind="craft"][data-rim]:not([data-rim=""])'
/** The badge, the guide chip, and the Controls and Guide buttons, named by what they are. */
const ALL_FURNITURE = `${BADGE_AND_CHIP}, button[aria-controls="orrery-controls"], button[aria-controls="orrery-guide"]`
const INSPECTOR = '[data-orrery-page] aside[aria-labelledby]'

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test.describe(`rim markers at ${String(viewport.width)} px (#160)`, () => {
    test.use({ viewport })

    test('a rim marker never sits under the badge or the guide chip', async ({ page }) => {
      await open(page, '#orrery?preset=earth')
      const rimMarker = page.locator(
        '[data-orrery-page] button[data-kind="craft"][data-rim]:not([data-rim=""])',
      )
      await expect(rimMarker.first()).toBeVisible({ timeout: 20_000 })
      await expect.poll(() => collisions(page, rimOrFurniture), { timeout: 10_000 }).toEqual([])
    })

    test('no label, rim marker or button overlaps another (#132)', async ({ page }) => {
      await open(page, '#orrery?preset=earth')
      await expect(page.locator(RIM_MARKER).first()).toBeVisible({ timeout: 20_000 })
      await expect
        .poll(() => collisions(page, touchesRimOrFurniture, ALL_FURNITURE), { timeout: 10_000 })
        .toEqual([])
    })

    test('with an asteroid’s inspector open, nothing sits under it (#132)', async ({ page }) => {
      await open(page, '#orrery?preset=earth')
      const asteroid = page.locator('[data-orrery-page] button[data-kind="asteroid"]:visible')
      await expect(asteroid.first()).toBeVisible({ timeout: 20_000 })
      await asteroid.first().click()
      await expect(page.locator(INSPECTOR)).toBeVisible()
      await expect
        .poll(() => collisions(page, touchesRimOrFurniture, `${ALL_FURNITURE}, ${INSPECTOR}`), {
          timeout: 10_000,
        })
        .toEqual([])
    })
  })
}

test.describe('the Heliosphere view at 1280 x 720 (#131)', () => {
  test.use({ viewport: { width: 1280, height: 720 } })

  test('the planets keep their names, and no two labels overlap', async ({ page }) => {
    // A fixed moment, so the planets sit the same way on every run.
    await open(page, '#orrery?t=2026-11-11T12:00:00Z&preset=heliosphere')
    const hiddenPlanets = () =>
      page.evaluate(() =>
        [
          ...document.querySelectorAll<HTMLElement>(
            '[data-orrery-page] [role="group"][aria-label="Bodies"] button:not([data-kind])',
          ),
        ]
          .filter((b) => b.hidden)
          .map((b) => b.textContent),
      )
    await expect.poll(hiddenPlanets, { timeout: 20_000 }).toEqual([])
    expect(await collisions(page, () => true)).toEqual([])
  })
})

test.describe('close-approach labels on a phone (#130)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('no two shown labels overlap in the Earth–Moon view', async ({ page }) => {
    await open(page, '#orrery?preset=earth')
    const asteroid = page.locator('[data-orrery-page] button[data-kind="asteroid"]:visible')
    await expect(asteroid.first()).toBeVisible({ timeout: 20_000 })
    await expect.poll(() => collisions(page, () => true), { timeout: 10_000 }).toEqual([])
  })
})

test.describe('crowded clusters on a phone (#127)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('Jupiter’s four moons all keep their labels', async ({ page }) => {
    // A crowded cluster: before #127, Ganymede and Callisto lost every slot here.
    await open(page, `#orrery?t=${NOON_ISO}&focus=Jupiter`, jovianMoons([20, 40, 200, 160]))
    const shownMoons = () =>
      page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('[data-orrery-page] button[data-kind="moon"]')]
          .filter((b) => !b.hidden)
          .map((b) => b.textContent)
          .sort(),
      )
    await expect
      .poll(shownMoons, { timeout: 20_000 })
      .toEqual(['Callisto', 'Europa', 'Ganymede', 'Io'])
  })
})

test.describe('the labels follow the furniture (#132 review)', () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test('opening the Controls sheet, with nothing selected, redraws the labels', async ({
    page,
  }) => {
    // Paused, so nothing else asks for a frame.
    await open(page, `#orrery?t=${NOON_ISO}&preset=heliosphere`)
    const canvas = page.locator('canvas[data-orrery-webgl]')
    const draws = async () => Number((await canvas.getAttribute('data-orrery-draws')) ?? 0)
    // Wait for the scene to settle: two reads a second apart agree.
    let before = -1
    await expect
      .poll(async () => {
        const a = await draws()
        await page.waitForTimeout(1000)
        const b = await draws()
        before = b
        return a === b
      })
      .toBe(true)
    await page.getByRole('button', { name: 'Controls', exact: true }).click()
    await expect.poll(draws).toBeGreaterThan(before)
  })
})
