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
  // #91 measured OrreryPage 11.4 kB and OrreryRenderer 7.0 kB gzip with the planets
  // only; #92/#93/#98 add asteroids, craft and satellites, so each gets room to 30 kB.
  // With the satellites (#98) OrreryPage measured 29.7 kB and OrreryRenderer 23.3 kB, so
  // 34 kB leaves room for #99's comets.
  // The satellite browser (#158) added 4.1 kB to OrreryPage (33.5 to 37.6 kB measured).
  // It is not a chunk of its own: any lazy chunk with JSX made the bundler pull the query
  // code out of the first-load entry into a fifth file (4 files became 5), so it ships in
  // the orrery chunk, which only the orrery tab loads. 40 kB leaves room.
  orreryGzip: 40_000,
  textureBytes: 1_500_000,
  // #105 measured the orrery's planet maps and ring strip at 486 kB together (Earth reuses
  // the globe's day-2048). They load with the orrery tab, never with the page.
  planetTextureTotal: 700_000,
  // #98 measured the satellite worker at 69.3 kB gzip: satellite.js with its embedded
  // single-thread WASM (the #97 bulk worker alone was ~44 kB) plus zod for the body check.
  satWorkerGzip: 80_000,
  // #115 measured the ten spacecraft models at 110-426 kB each, 2.16 MB together. Only the
  // focused craft's model loads, so the total is disk, not a visitor's download.
  craftModelBytes: 500_000,
  craftModelTotal: 3_000_000,
  // three's GLTFLoader, fetched with the first craft model (#115).
  gltfLoaderGzip: 30_000,
}

const THREE_MARKER = 'WebGLRenderer'
// satellite.js's SatRecError names survive minification. It loads with the first
// orbit to propagate, not with the page (#97): in the first load it cost ~5 kB gzip
// and split the first-load code into 18 chunks.
const SGP4_MARKER = 'SemiLatusRectumBelowZero'
// The orrery (#91) is a whole page behind its tab: its page and renderer name these in
// markup and on the canvas, and neither may reach the first load.
const ORRERY_MARKERS = ['data-orrery-page', 'orreryWebgl']
// The satellite worker (#98) and its catalogue load with the orrery's satellite layer:
// the client names the worker file, the catalogue names its debris groups.
const SAT_MARKERS = ['sats.worker', 'fengyun-1c-debris']
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

  // First-load JavaScript is the entry plus every chunk it imports statically, which Vite
  // lists as modulepreload links. Since #75 split the console Rest panels out, the code
  // they share with the entry sits in its own chunk; measuring the entry file alone
  // read 140.8 kB while first paint still loaded about 180 kB.
  const entryPath = entryMatch[1]
  const preloads = [...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1])
  const initial = [entryPath, ...preloads]
  const bodies = initial.map((path) => readFileSync(join(distDir, path)))
  const initialGzip = bodies.reduce((sum, body) => sum + gz(body), 0)
  const parts = preloads.length > 0 ? ` + ${preloads.join(', ')}` : ''
  add('entry-gzip', initialGzip <= budgets.entryGzip, `${entryPath}${parts} ${kb(initialGzip)} gzip (budget ${kb(budgets.entryGzip)})`)
  const withThree = initial.filter((_, i) => bodies[i].includes(THREE_MARKER))
  add(
    'entry-has-no-three',
    withThree.length === 0,
    withThree.length > 0 ? `${withThree.join(', ')} contains ${THREE_MARKER}: three.js must be a lazy chunk` : 'three.js not in first-load chunks',
  )
  const withSgp4 = initial.filter((_, i) => bodies[i].includes(SGP4_MARKER))
  add(
    'entry-has-no-sgp4',
    withSgp4.length === 0,
    withSgp4.length > 0
      ? `${withSgp4.join(', ')} contains ${SGP4_MARKER}: satellite.js must load on first use (src/lib/orbit/loadPropagate.ts)`
      : 'satellite.js not in first-load chunks',
  )

  const withOrrery = initial.filter((_, i) => ORRERY_MARKERS.some((m) => bodies[i].includes(m)))
  add(
    'entry-has-no-orrery',
    withOrrery.length === 0,
    withOrrery.length > 0
      ? `${withOrrery.join(', ')} contains orrery code: it must load with its tab (App.tsx lazy OrreryPage)`
      : 'orrery not in first-load chunks',
  )

  const withSats = initial.filter((_, i) => SAT_MARKERS.some((m) => bodies[i].includes(m)))
  add(
    'entry-has-no-sat-worker',
    withSats.length === 0,
    withSats.length > 0
      ? `${withSats.join(', ')} contains satellite worker or catalogue code: it must load on first use (loadSatWorker.ts)`
      : 'satellite worker and catalogue not in first-load chunks',
  )

  for (const name of readdirSync(join(distDir, 'assets'))) {
    if (!name.endsWith('.js') || initial.includes(`assets/${name}`)) continue
    const body = readFileSync(join(distDir, 'assets', name))
    if (name.startsWith('sats.worker-')) {
      const size = gz(body)
      add('sat-worker-gzip', size <= budgets.satWorkerGzip, `${name} ${kb(size)} gzip (budget ${kb(budgets.satWorkerGzip)})`)
    } else if (name.startsWith('GLTFLoader-')) {
      const size = gz(body)
      add('gltf-loader-gzip', size <= budgets.gltfLoaderGzip, `${name} ${kb(size)} gzip (budget ${kb(budgets.gltfLoaderGzip)})`)
    } else if (name.startsWith('OrreryPage-') || name.startsWith('OrreryRenderer-')) {
      const size = gz(body)
      add('orrery-gzip', size <= budgets.orreryGzip, `${name} ${kb(size)} gzip (budget ${kb(budgets.orreryGzip)})`)
    } else if (body.includes(THREE_MARKER)) {
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
      const stat = statSync(join(textureDir, name))
      if (!stat.isFile()) continue
      add('texture-bytes', stat.size <= budgets.textureBytes, `textures/${name} ${kb(stat.size)} (budget ${kb(budgets.textureBytes)})`)
    }
  }

  const planetDir = join(distDir, 'textures', 'planets')
  if (existsSync(planetDir)) {
    let total = 0
    for (const name of readdirSync(planetDir)) {
      const bytes = statSync(join(planetDir, name)).size
      total += bytes
      add('planet-texture-bytes', bytes <= budgets.textureBytes, `textures/planets/${name} ${kb(bytes)} (budget ${kb(budgets.textureBytes)})`)
    }
    add('planet-texture-total', total <= budgets.planetTextureTotal, `textures/planets ${kb(total)} (budget ${kb(budgets.planetTextureTotal)})`)
  }
  const modelDir = join(distDir, 'models', 'craft')
  if (existsSync(modelDir)) {
    let total = 0
    for (const name of readdirSync(modelDir)) {
      const bytes = statSync(join(modelDir, name)).size
      total += bytes
      add('craft-model-bytes', bytes <= budgets.craftModelBytes, `models/craft/${name} ${kb(bytes)} (budget ${kb(budgets.craftModelBytes)})`)
    }
    add('craft-model-total', total <= budgets.craftModelTotal, `models/craft ${kb(total)} (budget ${kb(budgets.craftModelTotal)})`)
  }
  add(
    'entry-has-no-craft-models',
    !html.includes('/models/craft/'),
    html.includes('/models/craft/') ? 'index.html names a craft model: they load with a focused craft (#115)' : 'no craft model in index.html',
  )
  add(
    'entry-has-no-planet-textures',
    !html.includes('/textures/planets/'),
    html.includes('/textures/planets/') ? 'index.html names a planet map: they load with the orrery tab (#105)' : 'no planet map in index.html',
  )
  return findings
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const findings = checkBundle(join(fileURLToPath(new URL('..', import.meta.url)), 'dist'))
  for (const f of findings) console.log(`${f.ok ? 'PASS' : 'FAIL'} ${f.rule}: ${f.detail}`)
  if (findings.some((f) => !f.ok)) process.exit(1)
}
