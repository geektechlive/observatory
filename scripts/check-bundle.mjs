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
  // Files in the first load (entry plus modulepreloads), a tripwire against runaway
  // splitting (#101 once went from 4 to 9). Not a target: HTTP/2 has no 6-connection limit.
  firstLoadFiles: 8,
  lazyThreeGzip: 160_000,
  worldMapGzip: 294_000,
  // #91 measured OrreryPage 11.4 kB and OrreryRenderer 7.0 kB gzip with the planets
  // only; #92/#93/#98 add asteroids, craft and satellites, so each gets room to 30 kB.
  // With the satellites (#98) OrreryPage measured 29.7 kB and OrreryRenderer 23.3 kB, so
  // 34 kB leaves room for #99's comets.
  // The satellite browser (#158, 4.4 kB gzip) briefly lived inside OrreryPage because as a
  // chunk of its own it split the first load (#162). vite.config.ts now pins everything the
  // entry imports statically into two chunks, so it is its own chunk again. With it out,
  // OrreryPage measured 34.7 kB and OrreryRenderer 24.4 kB (2026-11-08); 38 kB leaves room.
  orreryGzip: 38_000,
  satBrowserGzip: 6_000,
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
  // The orrery's guide drawer (#159): lessons, reference copy and the glossary, fetched
  // on the first open. Measured 8.7 kB gzip, plus a small glossary chunk it shares with
  // the inspector's term buttons.
  orreryGuideGzip: 12_000,
  // The "Look closer" view (#203): its own canvas, scene and chrome, fetched on the first
  // open. It shares three.js and GLTFLoader with the orrery, so the chunk is small.
  detailViewGzip: 8_000,
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
// The guide drawer (#159) names this on its root element; it lives in its own chunk,
// loaded on first open, and may reach neither the first load nor the orrery page's chunk.
const GUIDE_MARKER = 'data-guide-drawer'
// The detail view (#203) names this on its root element; same rules as the guide.
const DETAIL_MARKER = 'data-detail-view'

// `import{a as b}from"./x.js"`, `import"./x.js"`, `export{a}from"./x.js"` and their spaced
// forms. A dynamic `import("./x.js")` has no clause or quote right after `import`.
const STATIC_IMPORT = /\b(?:import|export)\s*(?:[\w$*\s,{}]*?\bfrom\s*)?["'`]\.\/([^"'`/]+\.js)["'`]/g

/** The `assets/` files reachable from `entryPath` through static imports (entry excluded). */
function staticGraph(distDir, entryPath) {
  const seen = new Set()
  const queue = [entryPath]
  while (queue.length > 0) {
    const path = queue.pop()
    const file = join(distDir, path)
    if (!existsSync(file)) continue
    for (const m of readFileSync(file, 'utf8').matchAll(STATIC_IMPORT)) {
      const dep = `assets/${m[1]}`
      if (dep === entryPath || seen.has(dep)) continue
      seen.add(dep)
      queue.push(dep)
    }
  }
  return seen
}
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

  // #155: no chain. A file the entry reaches through static imports but index.html does
  // not preload is requested only after its parent has arrived and run; on a phone that
  // is a round trip each (#168 measured the orrery's two hops at ~530 ms on desktop).
  const reached = staticGraph(distDir, entryPath)
  const unlisted = [...reached].filter((p) => !initial.includes(p))
  add(
    'first-load-no-chain',
    unlisted.length === 0,
    unlisted.length === 0
      ? `all ${reached.size} files of the entry's static import graph are modulepreloaded`
      : `${unlisted.join(', ')} imported statically but not in index.html's modulepreload list: the browser finds it only after its parent runs`,
  )
  // A tripwire against accidental fragmentation, not a target: over HTTP/2 the count costs
  // a request each and slightly worse compression, never a connection limit.
  const maxFiles = budgets.firstLoadFiles ?? BUDGETS.firstLoadFiles
  add('first-load-files', initial.length <= maxFiles, `${initial.length} files (ceiling ${maxFiles})`)

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

  const withGuide = initial.filter((_, i) => bodies[i].includes(GUIDE_MARKER))
  add(
    'entry-has-no-guide',
    withGuide.length === 0,
    withGuide.length > 0
      ? `${withGuide.join(', ')} contains the guide drawer: it must load on first open (OrreryPage.tsx lazy OrreryGuide)`
      : 'guide drawer not in first-load chunks',
  )

  const withDetail = initial.filter((_, i) => bodies[i].includes(DETAIL_MARKER))
  add(
    'entry-has-no-detail',
    withDetail.length === 0,
    withDetail.length > 0
      ? `${withDetail.join(', ')} contains the detail view: it must load on first open (OrreryPage.tsx lazy DetailView)`
      : 'detail view not in first-load chunks',
  )

  let sawOrreryPage = false
  let sawGuideChunk = false
  let sawDetailChunk = false
  for (const name of readdirSync(join(distDir, 'assets'))) {
    if (!name.endsWith('.js') || initial.includes(`assets/${name}`)) continue
    const body = readFileSync(join(distDir, 'assets', name))
    if (name.startsWith('OrreryGuide-')) {
      sawGuideChunk = true
      const size = gz(body)
      add('orrery-guide-gzip', size <= budgets.orreryGuideGzip, `${name} ${kb(size)} gzip (budget ${kb(budgets.orreryGuideGzip)})`)
    } else if (name.startsWith('DetailView-')) {
      sawDetailChunk = true
      const size = gz(body)
      add('orrery-detail-gzip', size <= budgets.detailViewGzip, `${name} ${kb(size)} gzip (budget ${kb(budgets.detailViewGzip)})`)
    } else if (name.startsWith('SatBrowser-')) {
      const size = gz(body)
      add('sat-browser-gzip', size <= budgets.satBrowserGzip, `${name} ${kb(size)} gzip (budget ${kb(budgets.satBrowserGzip)})`)
    } else if (name.startsWith('sats.worker-')) {
      const size = gz(body)
      add('sat-worker-gzip', size <= budgets.satWorkerGzip, `${name} ${kb(size)} gzip (budget ${kb(budgets.satWorkerGzip)})`)
    } else if (name.startsWith('GLTFLoader-')) {
      const size = gz(body)
      add('gltf-loader-gzip', size <= budgets.gltfLoaderGzip, `${name} ${kb(size)} gzip (budget ${kb(budgets.gltfLoaderGzip)})`)
    } else if (name.startsWith('OrreryPage-') || name.startsWith('OrreryRenderer-')) {
      if (name.startsWith('OrreryPage-')) {
        sawOrreryPage = true
        add(
          'orrery-page-has-no-guide',
          !body.includes(GUIDE_MARKER),
          body.includes(GUIDE_MARKER) ? `${name} contains the guide drawer: it must stay a separate lazy chunk` : `${name} does not contain the guide drawer`,
        )
        add(
          'orrery-page-has-no-detail',
          !body.includes(DETAIL_MARKER),
          body.includes(DETAIL_MARKER) ? `${name} contains the detail view: it must stay a separate lazy chunk` : `${name} does not contain the detail view`,
        )
      }
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

  // A rename of the guide's chunk must not quietly switch its budget off.
  if (sawOrreryPage) {
    add(
      'orrery-guide-found',
      sawGuideChunk,
      sawGuideChunk ? 'OrreryGuide chunk found' : 'no OrreryGuide-*.js chunk next to OrreryPage: its budget rule would not run',
    )
  }

  if (sawOrreryPage) {
    add(
      'orrery-detail-found',
      sawDetailChunk,
      sawDetailChunk ? 'DetailView chunk found' : 'no DetailView-*.js chunk next to OrreryPage: its budget rule would not run',
    )
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
