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
  Regenerate with `pnpm test:unit tests/unit/palette.test.ts -u`, and never hand-edit it.
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
- **The credit line is a licence term, so it stays open (#94, #179).** CARTO requires
  "© OpenStreetMap contributors, © CARTO" "Visible on the map, legible, in any corner. Not
  hidden, faded or behind a click" (carto.com/attributions, read 2026-11-08). The control is
  `AttributionControl({ compact: false })`: a compact one, or an unset one on a narrow map,
  folds behind a button after the first drag. Sources whose terms ask for credit carry it as
  the source's `attribution` (OpenAQ, adsb.lol), and MapLibre lists it while one of that
  source's layers is visible. `tests/e2e/map-credits.spec.ts` checks all of it. It serves
  a dated copy of CARTO's style (`tests/e2e/mapCredit.ts`) and refuses CARTO's network (#143):
  CARTO's own credit is in the style, so the line stays empty until the style arrives, and
  in one gate run it hadn't within 15 s. That was not a gap for visitors, because a map whose
  style is still pending draws nothing of CARTO's. The copy won't notice if CARTO changes its
  credit. From 900px the
  control's `max-width` stops it short of the ISS plate, so a long credit wraps instead of
  running under the plate (`src/styles/global.css`). Elsewhere on the
  site, the Launches panel says "Data by RocketLaunch.Live" and the Tonight panel "Weather data
  by Open-Meteo.com" beside the cloud cover, as those services ask.
- **CARTO dark-matter's `background` layer is the land; water is a fill on top of it.**
  `src/lib/basemap.ts` repaints those vector layers on `style.load`. Never grade the map with a
  CSS `filter`: it recolours every data layer. `tests/e2e/map-renders.spec.ts` guards this.
- **NASA GIBS layers (#211): Imagery, Night lights, Precipitation, all off by default.** Tiles
  come straight from `gibs.earthdata.nasa.gov` in the browser (no Function). Config lives in
  `src/lib/gibs.ts`; values are from GIBS's EPSG:3857 WMTS capabilities
  (`https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml`, read
  2026-11-12):
  - **Imagery:** `MODIS_Terra_CorrectedReflectance_TrueColor`, `GoogleMapsCompatible_Level9`,
    yesterday (UTC).
  - **Night lights:** `VIIRS_Black_Marble`, `GoogleMapsCompatible_Level8`, PNG. It is an annual
    composite with only `2012-01-01` and `2016-01-01`, so it shows 2016, and the credit says so.
    The image is opaque (`raster-opacity: 0.9`) and hides the basemap's borders. It is not
    graded: ROCI v2 calls the city lights emissive, and emissive matter is never graded, so its
    dark navy sea stays as GIBS draws it (as MODIS's ocean does).
  - **Precipitation:** `IMERG_Precipitation_Rate` (the daily image; `_30min` has a sparse,
    gappy time domain), `GoogleMapsCompatible_Level6`, PNG, `raster-opacity: 0.7`. Dry areas are
    transparent in GIBS's colormap. It is a data scale, so it is never graded, and the credit
    states the day shown. GIBS's own colours put snow in cyan-blue and the heaviest rain in red,
    which overlaps the ROCI reservations (cyan for spacecraft, red for hazard); recolouring
    would break the scale's meaning, so it is left as GIBS draws it. There is no colour legend.
    The day is two days back from noon UTC and three before (`imergDate()`), a lag observed once
    (2026-11-12); GIBS publishes none. If that day is missing (a gap day, or NASA publishing
    late), its tiles 404 and the layer shows blank under a credit naming the day. Accepted,
    as the layer is off by default; nothing retries.
  - Each source's `maxzoom` matches its matrix set's deepest level, so deeper zooms overzoom
    rather than asking for tiles that 404.
  - All three sit above CARTO's layers and under every marker.
- **GIBS's acknowledgment is a licence term and shows once.** GIBS asks for "We acknowledge the
  use of imagery provided by services from NASA's Global Imagery Browse Services (GIBS), part of
  NASA's Earth Science Data and Information System (ESDIS)." (nasa-gibs.github.io/gibs-api-docs/,
  read 2026-11-12). MapLibre lists every distinct source credit, so the sentence is not repeated on
  each tile source: an empty GeoJSON source `gibs-credit` carries it, and its invisible
  `gibs-credit-anchor` layer is shown while any GIBS layer is on. Tile sources carry only the
  product and date. `tests/e2e/map-gibs.spec.ts` checks it shows once and stays clear of the
  plates.

## Fonts

- Fonts are self-hosted in `public/fonts/` (woff2 latin subset). Do not re-add Google Fonts CDN
  links; the `font-src 'self'` CSP depends on this.
- **Verify a downloaded font is actually a font**: `special-elite-latin.woff2` shipped for months
  as a 1.6 KB Google 404 HTML page. Check the magic bytes are `wOF2`
  (`head -c 4 file | xxd -p` = `774f4632`).
