/**
 * A cold desktop load must not jump (#169). Cloudflare Web Analytics reported a desktop
 * CLS p75 of 0.244. Measured on a cold 1440x900 and 1920x1080 load, the shifts were the
 * console column growing as its feeds arrived (the voice line from one line to two, each
 * lead panel from its "Loading" box to its data), the ISS plate widening with its first
 * position, and the globe's lens growing after first paint. Fonts were not a source on
 * desktop: the layout does not reflow when they swap (on a phone one was, #174, below).
 * This test replays the load with delayed feeds and sums the layout-shift entries the way
 * the CLS metric does (ignoring shifts that follow input), at 1440, 1920 and 390 px wide.
 * It also holds the ticker at zero (#175): Space-Track's re-entries landing after the
 * storms used to push the storms a screen width along (0.0095 at 1920 px here). The
 * re-entries must still lead (#101).
 */
import { expect, type Page, test } from '@playwright/test'

import {
  AFTERSHOCKS,
  CO2,
  EONET,
  ISS_TLE,
  NWS_ALERTS,
  SOLAR_WIND,
  SPACETRACK,
} from './feedFixtures'

const FALLBACK_DELAY_MS = 500
/**
 * Google's "good" is 0.1. This replay is milder than a real load (its feeds come from
 * a mock), so 0.1 would have passed the code that shipped: that scored 0.044 at 1440 px
 * and 0.019 at 1920 px here, and about 0.07 to 0.09 against production. With the fixes
 * it scored 0.0002 and 0.0028; with the ticker's feeds added (#175) it scores about
 * 0.0005 at 1440 px, 0.0029 at 1920 px and 0.0018 at 390 px, so the budget sits an
 * order of magnitude under "good".
 */
const CLS_BUDGET = 0.01

/**
 * Just after the newest timestamp in feedFixtures. The page's clock is frozen here (#184):
 * panels drop data by age, so against the real clock these fixtures expire a day later.
 */
const NOW = Date.UTC(2026, 10, 8, 15, 40, 0)

/** Four quakes over M5, so the voice line is its usual two lines. */
const QUAKES = {
  updatedAt: new Date(NOW).toISOString(),
  quakes: [
    ['central Mid-Atlantic Ridge', 5.8],
    ['10 km NW of Hamakata, Japan', 5.5],
    ['91 km ENE of Hihifo, Tonga', 5.1],
    ['41 km WSW of Gadung, Philippines', 5.2],
  ].map(([place, mag], i) => ({
    id: `q${String(i)}`,
    mag: mag as number,
    place: place as string,
    lat: -10 + i * 20,
    lon: 140 + i * 5,
    depthKm: 10,
    time: NOW - i * 3_600_000,
    tsunami: false,
    url: 'https://earthquake.usgs.gov/',
  })),
}

async function watchShifts(page: Page) {
  await page.addInitScript(() => {
    const shifts: { value: number; hadRecentInput: boolean; inTicker: boolean }[] = []
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        const entry = e as PerformanceEntry & {
          value: number
          hadRecentInput: boolean
          sources: { node: Node | null }[]
        }
        const inTicker = entry.sources.some((s) => {
          const el = s.node instanceof Element ? s.node : (s.node?.parentElement ?? null)
          return el?.closest('[aria-label="Live event feed"]') != null
        })
        shifts.push({ value: entry.value, hadRecentInput: entry.hadRecentInput, inTicker })
      }
    }).observe({ type: 'layout-shift', buffered: true })
    ;(window as unknown as { layoutShifts: typeof shifts }).layoutShifts = shifts
  })
}

/**
 * Each feed's data and how long it takes. The delays are spread because real feeds
 * arrive one by one, and a shift counts every time the layout moves, not once per load.
 */
const FEEDS: Record<string, { body: unknown; delayMs: number }> = {
  '/api/iss-tle': { body: ISS_TLE, delayMs: 300 },
  '/api/quakes': { body: QUAKES, delayMs: 450 },
  '/api/solar-wind': { body: SOLAR_WIND, delayMs: 700 },
  '/api/aftershocks': { body: AFTERSHOCKS, delayMs: 900 },
  '/api/nws-alerts': { body: NWS_ALERTS, delayMs: 1100 },
  '/api/co2': { body: CO2, delayMs: 1300 },
  // The ticker's feeds (#175): Space-Track's re-entries lead the ticker but land after
  // the storms already scrolling, so a strip in feed order pushed the storms along.
  '/api/eonet': { body: EONET, delayMs: 600 },
  '/api/spacetrack': { body: SPACETRACK, delayMs: 1500 },
}

/** Answer each feed after its delay; every other feed as unavailable. */
async function delayFeeds(page: Page) {
  await page.route('**/api/**', async (route) => {
    const feed = FEEDS[new URL(route.request().url()).pathname]
    await new Promise((resolve) => setTimeout(resolve, feed?.delayMs ?? FALLBACK_DELAY_MS))
    if (feed) {
      await route.fulfill({ json: feed.body })
      return
    }
    await route.fulfill({ status: 503, json: { error: 'mock' } })
  })
}

/** The CLS sum, and the part of it with a source inside the ticker. */
async function cumulativeShift(page: Page): Promise<{ total: number; ticker: number }> {
  return page.evaluate(() => {
    const shifts = (
      window as unknown as {
        layoutShifts: { value: number; hadRecentInput: boolean; inTicker: boolean }[]
      }
    ).layoutShifts.filter((s) => !s.hadRecentInput)
    const sum = (list: typeof shifts) => list.reduce((total, s) => total + s.value, 0)
    return { total: sum(shifts), ticker: sum(shifts.filter((s) => s.inTicker)) }
  })
}

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 390, height: 844 },
]) {
  test(`a cold ${String(viewport.width)}px load of / stays under ${String(CLS_BUDGET)} CLS`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport)
    await page.clock.setFixedTime(new Date(NOW))
    await watchShifts(page)
    await delayFeeds(page)
    await page.goto('/')
    await expect(page.getByText('central Mid-Atlantic Ridge')).toBeVisible()
    const ticker = page.getByRole('region', { name: 'Live event feed' })
    await expect(ticker.getByText('STARLINK-1284').first()).toBeAttached()
    // Let the globe, the ISS readout and every late panel settle.
    await page.waitForTimeout(3000)
    const cls = await cumulativeShift(page)
    // Re-entries still lead the strip (#101), and items arriving never move the ones
    // already there (#175).
    await expect(ticker.locator('[class*="label"]').first()).toHaveText('RE-ENTRY')
    expect(cls.ticker, `ticker layout shift ${cls.ticker.toFixed(4)}`).toBe(0)
    expect(cls.total, `cumulative layout shift ${cls.total.toFixed(4)}`).toBeLessThan(CLS_BUDGET)
  })
}

/**
 * A cold phone #orrery load must not jump when the display font arrives (#174). On a
 * throttled phone, Fraunces italic landed at about 3.8 s; the voice sentence, three lines in
 * the Georgia fallback at 390 px, became two, and the stage and the "Solar system in 3D"
 * line moved up 31 px (CLS 0.0258 of 0.0334 on production). Locally the font arrives before
 * first paint, so the test holds it back. It counts only shifts of the voice strip and the
 * stage box itself: the renderer's planet labels settling inside the stage are not layout.
 * It can only fail where Georgia is installed (macOS), as the wrap difference is Georgia's.
 */
test('a cold 390px #orrery load does not move the stage when the display font arrives (#174)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.clock.setFixedTime(new Date(NOW))
  await page.addInitScript(() => {
    const shifts: { value: number; nodes: string[] }[] = []
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        const entry = e as PerformanceEntry & {
          value: number
          hadRecentInput: boolean
          sources: { node: Node | null }[]
        }
        if (entry.hadRecentInput) continue
        const nodes = entry.sources
          .map((s) => (s.node instanceof Element ? s.node : (s.node?.parentElement ?? null)))
          .filter(
            (el): el is Element =>
              el?.matches('[data-orrery-page] > :first-child *, section[aria-label="Orrery"]') ===
              true,
          )
          .map((el) => `${el.tagName.toLowerCase()} "${el.textContent.slice(0, 30)}"`)
        if (nodes.length > 0) shifts.push({ value: entry.value, nodes })
      }
    }).observe({ type: 'layout-shift', buffered: true })
    ;(window as unknown as { headerShifts: typeof shifts }).headerShifts = shifts
  })
  let fontServed = false
  await page.route('**/fonts/fraunces-italic-latin.woff2', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2000))
    fontServed = true
    await route.continue()
  })
  await page.goto('/#orrery')
  const voice = page.locator('[data-orrery-page] > :first-child > p').first()
  await expect(voice).toContainText('nearest planet')
  await expect.poll(() => fontServed, { timeout: 10_000 }).toBe(true)
  await expect
    .poll(() => page.evaluate(() => document.fonts.check('italic 300 16px Fraunces')))
    .toBe(true)
  // Two frames for the swap's relayout to be reported.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  )
  const shifts = await page.evaluate(
    () =>
      (window as unknown as { headerShifts: { value: number; nodes: string[] }[] }).headerShifts,
  )
  expect(shifts, 'the voice line or the stage moved').toEqual([])
})

/** Orrery sentences of every length the voice can say (voice.ts), for the width sweep. */
const ORRERY_SENTENCES = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'].flatMap((name) =>
  ['0.28', '1.37', '10.12'].flatMap((au) =>
    ['closing', 'pulling away'].flatMap((motion) =>
      ['1.2', '38.7'].map(
        (rate) => `${name} is the nearest planet, ${au} au away and ${motion} at ${rate} km/s.`,
      ),
    ),
  ),
)

/**
 * The display font's fallback is metric-matched (#220): `Fraunces Fallback` is local Georgia
 * Italic scaled to Fraunces's advance widths at each weight the site uses, with Fraunces's
 * vertical metrics, so text set before Fraunces arrives takes about the room it will keep.
 * Plain Georgia Italic ran 8 to 10% wider than Fraunces 300 and wrapped the orrery's sentence
 * to three lines at 390 px where Fraunces needs two. The test sets the voice line's own text,
 * and a sweep of orrery sentences, in the fallback stack and in Fraunces. Glyph widths still
 * differ by up to about 1% per sentence, so a sentence near a line end can still wrap
 * differently: that, and sentences that are three lines in Fraunces, is why #174's
 * three-line reserve stays. It can only fail where Georgia is installed: elsewhere the stack
 * falls through to the next serif.
 */
test('the voice line is as wide in its fallback as in Fraunces (#220)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.clock.setFixedTime(new Date(NOW))
  await page.goto('/#orrery')
  const hasGeorgia = await page.evaluate(() =>
    new FontFace('georgia-probe', "local('Georgia Italic'), local('Georgia-Italic')").load().then(
      () => true,
      () => false,
    ),
  )
  test.skip(!hasGeorgia, 'Georgia Italic is not installed here, so the fallback cannot be measured')
  const voice = page.locator('[data-orrery-page] > :first-child > p').first()
  await expect(voice).toContainText('nearest planet')
  await expect
    .poll(() => page.evaluate(() => document.fonts.check('italic 300 16px Fraunces')))
    .toBe(true)
  const result = await voice.evaluate((el, sweep) => {
    const cs = getComputedStyle(el)
    // The stack the browser draws with until Fraunces arrives: everything after Fraunces.
    const fallback = cs.fontFamily.split(',').slice(1).join(',')
    function set(text: string, family: string, width: string) {
      const p = document.createElement('p')
      Object.assign(p.style, {
        position: 'absolute',
        visibility: 'hidden',
        margin: '0',
        width,
        whiteSpace: width === 'max-content' ? 'nowrap' : 'normal',
        font: `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} / ${cs.lineHeight} ${family}`,
        textWrap: cs.textWrap,
      })
      p.textContent = text
      document.body.append(p)
      const range = document.createRange()
      range.selectNodeContents(p)
      const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size
      const w = p.getBoundingClientRect().width
      p.remove()
      return { lines, w }
    }
    const width = `${String(el.getBoundingClientRect().width)}px`
    const text = el.textContent
    const ratio = (t: string) =>
      set(t, fallback, 'max-content').w / set(t, 'Fraunces', 'max-content').w
    return {
      fallback,
      lines: {
        fallback: set(text, fallback, width).lines,
        fraunces: set(text, 'Fraunces', width).lines,
      },
      // The sentence furthest from Fraunces's width, of the real one and the sweep.
      worst: Math.max(...[text, ...sweep].map((t) => Math.abs(ratio(t) - 1))),
    }
  }, ORRERY_SENTENCES)
  expect
    .soft(result.fallback, 'the fallback stack starts with the matched face')
    .toContain('Fraunces Fallback')
  // Within 2% of Fraunces's width (about 1% measured); plain Georgia Italic is 8 to 10% wider.
  expect.soft(result.worst, `worst width error ${result.worst.toFixed(3)}`).toBeLessThan(0.02)
  expect(result.lines.fallback, 'the voice line wraps the same before and after the swap').toBe(
    result.lines.fraunces,
  )
})
