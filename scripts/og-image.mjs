#!/usr/bin/env node
/**
 * Builds public/og-image.png, the 1200x630 link preview (#110): "one lens, one line".
 *
 *   node scripts/og-image.mjs [baseURL]     (default https://observatory.geektechlive.com)
 *
 * 1. Opens the live site in Chromium on the real GPU (Metal on macOS), so the globe draws
 *    the high tier: bloom, the 4096 textures, city lights. Every layer is off
 *    (`#earth?layers=`) and the bezel's minor ticks, numerals and census arc are hidden,
 *    so the lens is the copper ring, its 12 major ticks, the reticle and the Earth.
 * 2. Renders scripts/og/template.html at 1200x630 (deviceScaleFactor 1) with that
 *    capture, the repo's tokens and self-hosted fonts.
 * 3. Writes public/og-image.png through sharp's palette PNG, under 300 KB
 *    (tests/unit/share-meta.test.ts).
 *
 * Run it after a visual change to the globe or the header. It needs a machine with a GPU
 * Chromium can use: headless SwiftShader draws the low tier, and the script refuses it.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { chromium } from '@playwright/test'
import sharp from 'sharp'

const ROOT = join(import.meta.dirname, '..')
const BASE = (process.argv[2] ?? 'https://observatory.geektechlive.com').replace(/\/$/, '')
const OUT = join(ROOT, 'public', 'og-image.png')
const MAX_BYTES = 300 * 1024
const WIDTH = 1200
const HEIGHT = 630

const GPU_ARGS = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']

/** Bezel detail that is noise at thumbnail size (GlobeBezel.tsx). */
const HIDE_BEZEL_DETAIL = `
  [data-globe-mode] [data-lane],
  [data-globe-mode] svg[role="img"] text,
  [data-globe-mode] [class*="tickMinor"] { display: none !important; }
`

// src/lib/globe3d.ts: the globe opens facing 82° east of the subsolar point (the evening
// terminator, #62) and turns west at GLOBE_SPIN_DEG_PER_SEC. It can't be dragged, but
// hovering it stops the turn.
const OPEN_OFFSET_DEG = 82
const SPIN_DEG_PER_SEC = (0.00006 * 1000 * 180) / Math.PI
/** The terminator sits ~20° east of centre: ~65% sunlit copper, city lights on the right. */
const FACING_OFFSETS = [60, 62, 64, 66, 68, 70, 72, 74, 76, 78, 80]
const FALLBACK_OFFSET = 70
/**
 * Rough longitude spans of land at mid-northern latitudes, where the lens shows most.
 * Oceans grade to near-void, so the framing wants land on both sides of the terminator.
 */
const LAND_SPANS = [
  [-125, -35], // the Americas
  [-15, 50], // Europe and Africa
  [50, 145], // Asia
]

const wrap = (lon) => ((((lon + 180) % 360) + 360) % 360) - 180

/** Subsolar longitude, without the equation of time (a few degrees at most). */
function subsolarLon(date) {
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60
  return wrap(180 - 15 * utcHours)
}

/** Degrees of land in [from, to] (both wrapped), sampled every 2°. */
function landIn(from, to) {
  let degrees = 0
  for (let d = 0; d <= to - from; d += 2) {
    const lon = wrap(from + d)
    if (LAND_SPANS.some(([a, b]) => lon >= a && lon <= b)) degrees += 2
  }
  return degrees
}

/**
 * The facing for the card: subsolar + 60..80°, scored by land on the lit side (the
 * visible hemisphere west of the terminator) plus land in the night third. Land must
 * show on both sides, or it falls back to +70°.
 */
function cardFacing(date) {
  const sun = subsolarLon(date)
  let best = { offset: FALLBACK_OFFSET, score: 0 }
  for (const offset of FACING_OFFSETS) {
    const facing = sun + offset
    const terminator = sun + 90
    const day = landIn(facing - 90, terminator)
    const night = landIn(terminator, facing + 90)
    const score = day > 0 && night > 0 ? day + 2 * night : 0
    if (score > best.score) best = { offset, score }
  }
  return { facing: wrap(sun + best.offset), offset: best.offset, score: best.score }
}

/**
 * The UTC hour today whose lighting frames best. At some hours the evening terminator
 * runs down the Pacific and no facing near it shows land, so the page's clock is fixed
 * to this hour instead (`page.clock.setFixedTime`): the globe draws the real lighting
 * for that moment, and the card comes out the same whenever it is regenerated.
 */
function sceneDate(now) {
  let best = { hour: 0, score: -1 }
  for (let hour = 0; hour < 24; hour += 1) {
    const at = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour))
    const { score } = cardFacing(at)
    if (score > best.score) best = { hour, score }
  }
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), best.hour))
}

/**
 * Waits while the globe turns from its opening facing to the card's facing, then hovers
 * it so the turn stops. `scene` is the page's (fixed) clock, which sets the lighting and
 * the opening facing; `openedAt` is the real time the renderer reported its tier, close
 * to when it started turning. A target already passed waits for the next turn.
 */
async function holdOnFacing(page, host, scene, openedAt) {
  const { facing, offset } = cardFacing(scene)
  const opening = wrap(subsolarLon(scene) + OPEN_OFFSET_DEG)
  let westward = (((opening - facing) % 360) + 360) % 360
  const elapsed = (Date.now() - openedAt.getTime()) / 1000
  while (westward / SPIN_DEG_PER_SEC < elapsed) westward += 360
  const wait = openedAt.getTime() + (westward / SPIN_DEG_PER_SEC) * 1000 - Date.now()
  if (wait > 0) await page.waitForTimeout(wait)
  const box = await host.boundingBox()
  if (!box) throw new Error('globe host has no box')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(800)
  return `scene ${scene.toISOString()}, facing ${facing.toFixed(0)}° (subsolar +${String(offset)}°) after ${(westward / SPIN_DEG_PER_SEC).toFixed(0)} s`
}

async function captureGlobe(browser, dir) {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1100 },
    deviceScaleFactor: 2,
  })
  const scene = sceneDate(new Date())
  await page.clock.setFixedTime(scene)
  // Only the day-night shading: every marker and the aurora stay off (useHashView). With
  // `layers=` alone the night side and its city lights go too.
  await page.goto(`${BASE}/?globe=webgl#earth?layers=terminator`)
  const host = page.locator('[data-globe-mode="webgl"]')
  await host.waitFor({ timeout: 30_000 })
  const canvas = page.locator('canvas[data-globe-bloom]')
  const bloom = await canvas.getAttribute('data-globe-bloom', { timeout: 30_000 })
  const openedAt = new Date()
  if (bloom !== 'bloom') {
    throw new Error(`globe drew "${String(bloom)}", not bloom: run this on a real GPU`)
  }
  // The high tier swaps its 4096 pair in after first paint (GlobeRenderer.upgradeTextures).
  // Polled from Node: the site's CSP forbids the eval a string waitForFunction needs.
  const texturesBy = Date.now() + 60_000
  while ((await canvas.getAttribute('data-globe-textures')) !== '4096') {
    if (Date.now() > texturesBy) throw new Error('the 4096 textures never loaded')
    await page.waitForTimeout(250)
  }
  await page.addStyleTag({ content: HIDE_BEZEL_DETAIL })
  console.log(`globe: ${await holdOnFacing(page, host, scene, openedAt)}`)
  const path = join(dir, 'globe.png')
  await host.screenshot({ path })
  await page.close()
  return path
}

async function compose(browser, captures) {
  const template = readFileSync(join(import.meta.dirname, 'og', 'template.html'), 'utf8')
  const html = template
    .replaceAll('{{ROOT}}', pathToFileURL(ROOT).href)
    .replaceAll('{{GLOBE}}', pathToFileURL(captures.globe).href)
  const file = join(captures.dir, 'card.html')
  writeFileSync(file, html)
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 1,
  })
  await page.goto(pathToFileURL(file).href)
  // A string, so this Node-linted script doesn't name the page's `document` global.
  await page.evaluate('document.fonts.ready.then(() => true)')
  const raw = await page.screenshot({ type: 'png' })
  await page.close()
  return raw
}

const browser = await chromium.launch({ args: GPU_ARGS })
try {
  const dir = mkdtempSync(join(tmpdir(), 'og-'))
  const globe = await captureGlobe(browser, dir)
  const raw = await compose(browser, { dir, globe })
  const png = await sharp(raw).png({ palette: true, quality: 90, effort: 10 }).toBuffer()
  if (png.length >= MAX_BYTES) {
    throw new Error(`og-image is ${String(png.length)} bytes, over ${String(MAX_BYTES)}`)
  }
  writeFileSync(OUT, png)
  console.log(`wrote ${OUT} (${String(png.length)} bytes); captures in ${dir}`)
} finally {
  await browser.close()
}
