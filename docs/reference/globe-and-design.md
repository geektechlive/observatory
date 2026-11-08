# Design system, page layout, globe and map

ROCI v2 "the Instrument" in code: colours, layout, the three.js globe, the MapLibre map and the
expand lens. The visual spec is
[design-history/roci-retrofit-v2.md](../design-history/roci-retrofit-v2.md); read it before any
visual change. Decision: [ADR 0005](../decisions/0005-roci-v2-the-instrument.md).

## Colours have exactly two sources (#36)

- `src/styles/tokens.css` holds the CSS tokens.
- `src/lib/palette.ts` holds the data colours. It emits hex, because MapLibre's parser rejects
  `oklch()`.
- `src/styles/palette.css` is **generated** from `palette.ts`. A unit test fails on drift.
  Regenerate with `pnpm exec vitest run tests/unit/palette.test.ts -u`, and never hand-edit it.
- Severity thresholds live in `src/lib/severity.ts` only.
- `design-lint.json` decides where the colour-literal and 11px type-floor lint applies. Add a
  directory when its reskin lands. Both stylelint and ESLint read it.

## Page layout follows the approved prototype (#63), not the v1 layout

- The prototype is `docs/design-history/mockups-v2.html` (Artifact WWKYsvhmPRvs4wyZ9WC1BE).
- Layout: `HeaderPlate`, then a grid in `App.module.css` of the dial rail, the lens and the
  console column, with each console's remaining panels below.
- Each console exports `Lead` and `Rest` (`consoleParts.ts`). `ConsoleVoice` writes the view's
  one Fraunces sentence from live data (`src/lib/voice.ts`).
- The globe is sized by `useLensSize`, and `GlobeRenderer.resize()` keeps the one WebGL context.
- VitalsSpine, BelterHeader and the Station Telemetry plate are gone on purpose.
- Under 900px the dial is a fixed bottom bar, a deliberate deviation from the prototype:
  `mobile.spec` needs it in view.

## Expand (#89)

A CSS full-screen lens, not the Fullscreen API (iPhone Safari has element fullscreen for video
only). `useLensExpand` locks scroll, handles Esc and returns focus, and marks the document
outside the app root `inert`; `App.tsx` marks its own siblings of the lens `inert`. The page
rises above the fixed ticker as a whole (it is an isolated stacking context), and the lens above
the phone's dial bar. Expanded, `globeSizeFor` drops the 760px cap, SunStage keeps the disc's
share of the stage, and the map takes the screen height. The globe keeps its one canvas
(`e2e/expand.spec.ts`). A new stage takes `size` from `useLensSize` and gets the button for free.

## The globe

- **WebGL nameplates skip the depth test, so occlusion must run BEFORE the draw (#60).**
  Satellite and ISS nameplate sprites use `depthTest: false` (otherwise the nearer Earth clips
  the name), and `updateOcclusion` hides the ones behind the Earth.
  `GlobeRenderer.syncOcclusion()` runs before every `render`, and plates are created
  `visible = false`. Running it after the draw, plus App handing over a fresh `[]` at 5 Hz (which
  rebuilt every plate), made back-side satellites strobe through the Earth. Keep layer props
  stable (shared empty arrays, `orNone` in GlobeHost), and keep satellites moving in place
  (`moveSpacecraft`), not rebuilding. Guarded by `globe-renderer.test.ts` (#60 block, incl. a
  limb-crossing check per drawn pose) and the `data-globe-builds` e2e in `globe-parity.spec.ts`.
- **Bloom (#50) is high tier only, and `pnpm verify` never draws it.** Headless Playwright runs on
  SwiftShader, which `gpuTier` calls low tier (sprites); `globe-webgl.spec` asserts that. Any
  change to `three/bloom.ts` needs a look on a real GPU (recipe in
  [local-dev.md](../operations/local-dev.md#a-real-gpu-in-playwright)). Never use
  `UnrealBloomPass.renderToScreen` here: it clears the canvas and copies its input first, which
  wiped the Earth. `bloom.ts` runs the pass offscreen and adds only the blur. City lights bloom
  through a depth-writing Earth twin (`earthBloomFragment`), which also keeps far-side glows
  hidden.
- Texture loading and preloads: [bundle-and-loading.md](bundle-and-loading.md#earth-textures-85-87).

## The map

- **maplibre-gl 6 needs `setWorkerUrl` wired by hand.** v6 is ESM-only and resolves its worker at
  runtime via `new URL('./maplibre-gl-worker.mjs', import.meta.url)`, a form no bundler detects
  statically, so Vite emits no worker asset and the request falls through to the SPA's
  `index.html`: **HTTP 200, no console error**. GeoJSON sources are parsed in that worker, so
  every vector layer (ISS, quakes, fires, EONET, NWS, aircraft, buoys, GDACS) goes silently dead
  while the raster basemap still draws. `WorldMap.tsx` imports the worker with `?worker&url` and
  passes it to `maplibregl.setWorkerUrl()`. `tests/e2e/map-health.spec.ts` guards it by asserting
  the worker URL is served as JavaScript, not as the SPA fallback; a status check alone cannot
  catch this.
- **CARTO dark-matter's `background` layer is the land; water is a fill on top of it.**
  `src/lib/basemap.ts` repaints those vector layers on `style.load`. Never grade the map with a
  CSS `filter`: it recolours every data layer. `tests/e2e/map-renders.spec.ts` guards this.

## Fonts

- Fonts are self-hosted in `public/fonts/` (woff2 latin subset). Do not re-add Google Fonts CDN
  links; the `font-src 'self'` CSP depends on this.
- **Verify a downloaded font is actually a font**: `special-elite-latin.woff2` shipped for months
  as a 1.6 KB Google 404 HTML page. Check the magic bytes are `wOF2`
  (`head -c 4 file | xxd -p` = `774f4632`).
