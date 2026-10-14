#!/usr/bin/env node
/**
 * Bundle budget (ROCI v2, #46). Runs in `pnpm verify` after the build.
 *
 * The globe is the default view, so anything in the entry chunk is on every
 * visitor's critical path. The Sep 2026 spike imported three.js statically and
 * grew the entry from 181 to 315 kB gzip; three.js must live in a lazy chunk,
 * behind the SVG globe's first paint. Textures are budgeted by bytes here and by
 * VRAM in the renderer (w x h x 4 x 1.33 per texture).
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

/**
 * Measured 2026-10-11 after Phase 1: entry 180.4 kB gzip, WorldMap 279.7 kB gzip.
 * The entry gets about 10 kB of headroom for the GlobeHost shell; WorldMap gets +5%.
 * The lazy three.js renderer measured 131.2 kB gzip with the Earth shader (#46, entry
 * grew only 1.4 kB); 160 kB leaves room for the data layers and bloom (#49, #50).
 */
export const BUDGETS = {
  entryGzip: 190_000,
  lazyThreeGzip: 160_000,
  worldMapGzip: 294_000,
  textureBytes: 1_500_000,
}

const THREE_MARKER = 'WebGLRenderer'
const gz = (buf) => gzipSync(buf, { level: 9 }).length
const kb = (n) => `${(n / 1000).toFixed(1)} kB`

/** @returns {{ ok: boolean, rule: string, detail: string }[]} */
export function checkBundle(distDir, budgets = BUDGETS) {
  const findings = []
  const add = (rule, ok, detail) => findings.push({ rule, ok, detail })

  const html = readFileSync(join(distDir, 'index.html'), 'utf8')
  const entryMatch = /<script[^>]+type="module"[^>]+src="\/(assets\/[^"]+\.js)"/.exec(html)
  add('entry-found', Boolean(entryMatch), entryMatch ? entryMatch[1] : 'index.html names no module script')
  if (!entryMatch) return findings

  const entryPath = entryMatch[1]
  const entry = readFileSync(join(distDir, entryPath))
  const entryGzip = gz(entry)
  add('entry-gzip', entryGzip <= budgets.entryGzip, `${entryPath} ${kb(entryGzip)} gzip (budget ${kb(budgets.entryGzip)})`)
  add(
    'entry-has-no-three',
    !entry.includes(THREE_MARKER),
    entry.includes(THREE_MARKER) ? `${entryPath} contains ${THREE_MARKER}: three.js must be a lazy chunk` : 'three.js not in entry',
  )

  for (const name of readdirSync(join(distDir, 'assets'))) {
    if (!name.endsWith('.js') || `assets/${name}` === entryPath) continue
    const body = readFileSync(join(distDir, 'assets', name))
    if (body.includes(THREE_MARKER)) {
      const size = gz(body)
      add('lazy-three-gzip', size <= budgets.lazyThreeGzip, `${name} ${kb(size)} gzip (budget ${kb(budgets.lazyThreeGzip)})`)
    } else if (name.startsWith('WorldMap-')) {
      const size = gz(body)
      add('worldmap-gzip', size <= budgets.worldMapGzip, `${name} ${kb(size)} gzip (budget ${kb(budgets.worldMapGzip)})`)
    }
  }

  const textureDir = join(distDir, 'textures')
  if (existsSync(textureDir)) {
    for (const name of readdirSync(textureDir)) {
      const bytes = statSync(join(textureDir, name)).size
      add('texture-bytes', bytes <= budgets.textureBytes, `textures/${name} ${kb(bytes)} (budget ${kb(budgets.textureBytes)})`)
    }
  }
  return findings
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const findings = checkBundle(join(fileURLToPath(new URL('..', import.meta.url)), 'dist'))
  for (const f of findings) console.log(`${f.ok ? 'PASS' : 'FAIL'} ${f.rule}: ${f.detail}`)
  if (findings.some((f) => !f.ok)) process.exit(1)
}
