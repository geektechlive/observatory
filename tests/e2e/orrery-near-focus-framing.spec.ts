/**
 * Focusing a close approach, or an L1/L2 craft, frames it with Earth (#133). The camera
 * used to stand a fixed 40 frame units from it in whatever direction it had, so Earth,
 * about 15 units away for a 0.04 au pass and 12.8 from L2, fell under the inspector or off
 * the stage depending on the view before. Now the focus and Earth's whole disc both sit in the part of the stage the
 * inspector and the time bar leave free. The canvas's `data-orrery-focus-px` and
 * `data-orrery-earth-px` are where each was drawn: "x,y,radiusPx" in canvas px.
 */
import { expect, type Page, test } from '@playwright/test'

import { moonPayload } from './moonPayload'
import { mockApproach, serveNeo } from './neoPayload'
import { offlineSun } from './swpc'

/**
 * About 0.04 au out, as Zoozve's and 2001 KF54's passes were on 2026-11-12. Before the fix,
 * from the Earth–Moon view at 1440×900, TZ9 left Earth off the stage's left edge and TY8
 * put it under the inspector; on a phone both left it off the stage's sides. (At 1920×1080
 * the wider stage held both even before.)
 */
const FLAGS = { pha: true, riskListed: false }
const FAR = [
  mockApproach('2026 TZ9', [0.04, 0, 0.005], [0, 0, 0], 1, FLAGS),
  mockApproach('2026 TY8', [-0.04, 0, 0.005], [0, 0, 0], 1, FLAGS),
]

const DAY_MS = 86_400_000
const JD_UNIX = 2440587.5

/**
 * An L1 or L2 craft beside moonPayload's Earth: `k` times Earth's heliocentric position
 * (0.99 sunward, L1; 1.01 away, L2), lifted `z` au off the ecliptic as a halo orbit is.
 */
function nearCraft(naifId: string, name: string, k: number, z: number) {
  const start = Math.floor(Date.now() / DAY_MS) + JD_UNIX - 3
  const samples: number[] = []
  for (let i = 0; i <= 6; i += 1) {
    const t = i - 3
    samples.push(k * (0.73 - 0.012 * t), k * (0.68 + 0.0127 * t), z, -0.012 * k, 0.0127 * k, 0)
  }
  return {
    id: `naif:${naifId}`,
    naifId,
    name,
    mission: `${name} (test)`,
    category: 'spacecraft',
    group: 'l1',
    target: `${name} (${naifId})`,
    observedUntil: null,
    availableFrom: null,
    availableTo: null,
    fine: { start, step: 1, samples },
    coarse: null,
  }
}

test.beforeEach(async ({ page }) => {
  await offlineSun(page)
  await serveNeo(page, FAR)
  const payload = moonPayload()
  const body = JSON.stringify({
    ...payload,
    bodies: [
      ...payload.bodies,
      nearCraft('-78', 'DSCOVR', 0.99, 0.0008),
      nearCraft('-170', 'JWST', 1.01, -0.0008),
    ],
  })
  await page.route('**/api/orrery-bodies', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'X-Data-Age': '3600' },
      body,
    }),
  )
})

/** What Find is typed, the option chosen and the focus key it opens. */
const CASES = [
  { query: '2026 TZ9', option: /^2026 TZ9/, focus: 'sb:2026 TZ9' },
  { query: '2026 TY8', option: /^2026 TY8/, focus: 'sb:2026 TY8' },
  // L1 and L2 (#133 review): the same fixed 40 units, about 12.8 from Earth.
  { query: 'DSCOVR', option: /^DSCOVR/, focus: 'naif:-78' },
  { query: 'JWST', option: /^JWST/, focus: 'naif:-170' },
]

const canvas = (page: Page) => page.locator('canvas[data-orrery-webgl]')

interface Box {
  l: number
  t: number
  r: number
  b: number
}

/** Boxes in canvas px: the drawn focus and Earth (padded by their radii) and what covers the stage. */
async function measure(page: Page) {
  return page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('canvas[data-orrery-webgl]')
    const aside = document.querySelector('[data-orrery-page] aside')
    const bar = document.querySelector('[aria-label="Simulation time"]')
    if (!c || !aside || !bar) return null
    const cb = c.getBoundingClientRect()
    const rel = (b: DOMRect) => ({
      l: b.left - cb.left,
      t: b.top - cb.top,
      r: b.right - cb.left,
      b: b.bottom - cb.top,
    })
    const disc = (v: string | undefined) => {
      const [x, y, r] = (v ?? '').split(',').map(Number)
      if (x === undefined || y === undefined || r === undefined || Number.isNaN(x + y + r))
        return null
      return { l: x - r, t: y - r, r: x + r, b: y + r }
    }
    return {
      stage: { l: 0, t: 0, r: cb.width, b: cb.height },
      inspector: rel(aside.getBoundingClientRect()),
      bar: rel(bar.getBoundingClientRect()),
      focus: disc(c.dataset['orreryFocusPx']),
      earth: disc(c.dataset['orreryEarthPx']),
    }
  })
}

/** Inside the stage, left of a drawer or above a sheet, and above the time bar. */
function inFreePart(
  box: Box | null,
  m: { stage: Box; inspector: Box; bar: Box },
  sheet: boolean,
): boolean {
  if (!box) return false
  const inside = box.l >= 0 && box.t >= 0 && box.r <= m.stage.r && box.b <= m.stage.b
  const clearOfInspector = sheet ? box.b <= m.inspector.t : box.r <= m.inspector.l
  return inside && clearOfInspector && box.b <= m.bar.t
}

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 390, height: 844 },
]

for (const viewport of VIEWPORTS) {
  const phone = viewport.width < 900
  test.describe(`close-approach focus at ${String(viewport.width)}×${String(viewport.height)} (#133)`, () => {
    test.use({ viewport })

    for (const { query, option, focus } of CASES) {
      test(`${query}, chosen from the Earth–Moon view, sits with Earth clear of the inspector and time bar`, async ({
        page,
      }) => {
        await page.goto('/#orrery')
        await expect(page.locator('[data-orrery-mode]')).toHaveAttribute(
          'data-orrery-mode',
          'webgl',
          { timeout: 20_000 },
        )
        const controls = page.getByRole('button', { name: 'Controls', exact: true })
        if (phone) await controls.click()
        await page.getByRole('button', { name: 'Earth–Moon', exact: true }).click()
        await expect(canvas(page)).toHaveAttribute('data-orrery-focus', 'earth')
        const find = page.getByRole('combobox', { name: 'Find a body' })
        if (phone && !(await find.isVisible())) await controls.click()
        await find.fill(query)
        await page.getByRole('option', { name: option }).first().click()
        await expect(canvas(page)).toHaveAttribute('data-orrery-focus', focus)
        await expect
          .poll(async () => canvas(page).getAttribute('data-orrery-earth-frame'))
          .toBe('1.00')
        // The flight and the refit for the inspector settle; then both are in the free part.
        await expect
          .poll(
            async () => {
              const m = await measure(page)
              if (!m) return 'not measured'
              const focus = inFreePart(m.focus, m, phone)
              const earth = inFreePart(m.earth, m, phone)
              return focus && earth ? 'clear' : JSON.stringify(m)
            },
            { timeout: 10_000 },
          )
          .toBe('clear')
      })
    }
  })
}
