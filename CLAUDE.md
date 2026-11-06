# observatory

> See /Users/chrisfavero/Source/CLAUDE.md for global conventions

NASA live-data dashboard — port of cosmo-tui. **ROCI Retrofit v2 "the Instrument"** (locked 2026-10-10): reflective copper housing, emissive data, ops-grade density. The spec is `docs/design-history/roci-retrofit-v2.md`; read it before any visual change. The old "Glass / Luxury Futurist" direction is history only.

## Stack

Vite 8 + React 19 + TypeScript 7 strict (6 for lint only, #97) · Cloudflare Pages + Pages Functions + Workers KV · pnpm

## Key commands

- `pnpm dev` — local Vite dev server
- `pnpm pages:dev` — local dev with Pages Functions (KV, env vars via .dev.vars)
- `pnpm build` — production build to dist/
- `pnpm lint` — ESLint + stylelint
- `pnpm typecheck` — tsc strict check
- `pnpm verify` — **the gate before every merge to `main`**: lint, typecheck, unit tests with coverage thresholds, build, e2e, and `pnpm audit --audit-level=high`. There is no CI (#33)

## Phase status

- Phase 1 (scaffold + infra): **complete**
- Phase 2 (map + ISS): **complete** — MapLibre + EONET markers + ISS live tracker
- Phase 3 (panels + ticker): **complete** — all 6 panels, ticker, footer, App.tsx wired
- Phase 4 (security + polish): **complete** — self-hosted fonts, CSP, OG/meta/favicon, AboutPopover, ApiQuotaMeter, quota tracking, code-split (WorldMap lazy), tests (unit + e2e), CI (3-job workflow)
- Phase 5 (The Instrument): **complete** — stage/console shell, OrbitalDial, 20-endpoint data buildout
- Phase 6 (map layers): **complete** — NWS alerts, aircraft, buoys, OVATION aurora, FIRMS fires, OpenAQ
- Phase 7 (audit remediation, 2026-09-07): **complete** — see "Free-tier budget" and "Data feeds" below
- Phase 8 (dependency + CI remediation, 2026-09-09): **complete** — CI had been red on every branch including `main` since 2026-06-20 (`pnpm/action-setup` with no `packageManager`); fixed, plus maplibre-gl 6.9.0 for a critical XSS, 30 advisories down to 1, and required status checks on `main` so a dead pipeline blocks merges instead of going quiet
- Redesign v2 (ROCI v2 + three.js globe): **complete** — landed 2026-10-13 (edba7ba), prototype layout 2026-10-23 (#63), selective bloom and aurora field 2026-10-24 (#50)
- 2026-10-09: CI, Dependabot update PRs and PRs themselves were **removed on purpose** (#33). This is a personal site, and CI only re-ran the local gates; it was dead for 11 weeks and the site never noticed. `pnpm verify` replaced it. Dependabot **security alerts** stay on. `data-refresh.yml` is production ops, not CI, and stays

## Free-tier budget (hard constraint)

This runs on the Cloudflare free plan and must stay there. Treat these as rules, not guidance:

- **Never write KV on a request path.** 1,000 writes/day. All KV writes happen out-of-band in `scripts/refresh-data.mjs` via GitHub Actions. A per-request KV write once exhausted the budget in hours.
- **`public/_routes.json` restricts Functions to `/api/*`.** Without it every static asset invokes the Worker. Do not widen it.
- **Response caching is the Cloudflare Cache API (`caches.default`), not KV** — free and unmetered, but per-colo and evictable. KV is only for durable fallbacks.
- **Serve third-party assets directly** (CSP allowlist) rather than proxying through a Function. EPIC images are loaded straight from NASA for this reason.
- Worker CPU is 10 ms per invocation, so parse small feeds: prefer NOAA's 6.5 KB one-hour product over the 1.1 MB full feed.

## Data feeds

- **CelesTrak is unreachable from Cloudflare Workers egress** (522 since ~2026-09-03) though it works from anywhere else. `/api/iss-tle` and `/api/satellites` are KV-first: a GitHub Action fetches and validates TLEs from a normal network and writes `tle:iss:v1` / `tle:satellites:v1`. The handlers fall back to live CelesTrak, then a hardcoded `FALLBACK_TLE`.
- **RocketLaunch.live is unreachable from Workers egress too** (seen 2026-10-09, #30), though it answers laptops and GitHub runners. `/api/launches` is KV-first: it serves `rll:launches:next:v1:backup` (written every 6 h by the refresh job) while it is ≤ 12 h old. After that it tries live RLL and logs why it failed, then falls back to the older KV copy marked degraded.
- **APOD moved to science.nasa.gov (seen 2026-10-25, #72).** apod.nasa.gov 301s there, and NASA's APOD API still scrapes the old page: it answers the real explanation with the title "NASA Science" and the NASA logo as `url`. `/api/apod` is KV-first: the refresh job reads the newest `/image-article/apod-<date>-…/` page (title from `<h1>`, picture from `og:image`, text from the hero description) into `apod:science:v1`, served while ≤ 12 h old. Then NASA's API, which rejects the placeholder as a contract failure, then the older KV copy degraded. If the refresh starts failing `refresh:apod`, NASA has redesigned the page again: fix `parseApodArticle` in `scripts/refresh-data.mjs` against a fresh copy.
- **JPL Horizons answers 503 to overlapping requests from one address (#88, measured 2026-11-06).** Nine parallel calls got two answers; the same nine one at a time all answered in ~140 ms each. `/api/planets` asks one body at a time, and any new Horizons caller must too.
- **NOAA SWPC feed drift (2026-09):** `noaa-planetary-k-index.json` became an array of objects, and `solar-wind/{plasma,mag}-7-day.json` returned 404. Solar wind and Bz now come from `products/geospace/propagated-solar-wind-1-hour.json` via the shared `functions/api/_swpc.ts`. Its cells are numbers, not numeric strings.
- **Upstream drift is silent by default.** A feed that changes shape yields an empty-but-HTTP-200 payload. `src/lib/health.ts` gives every source a content contract so this reads as an error, and `scripts/check-health.mjs` probes the headline endpoints on a schedule.

## Gotchas

- CSS modules use `localsConvention: 'camelCase'` — class names in `.module.css` must be camelCase
- `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`: CSS module lookups are `string | undefined`; use `?? ''` and `?: string | undefined` in props
- Stylelint disables: `color-function-notation`, `property-no-vendor-prefix`, `selector-class-pattern` — intentional, see stylelint.config.js
- **`@keyframes` blocks**: always put an empty line between each keyframe selector (`0%`, `50%`, `from`, `to`) — CI Linux stylelint enforces `rule-empty-line-before` more strictly than macOS; the pre-commit hook may not catch it locally
- **maplibre-gl 6 needs `setWorkerUrl` wired by hand.** v6 is ESM-only and resolves its worker at runtime via `new URL('./maplibre-gl-worker.mjs', import.meta.url)` — a form no bundler detects statically, so Vite emits no worker asset and the request falls through to the SPA's `index.html`: **HTTP 200, no console error**. GeoJSON sources are parsed in that worker, so every vector layer (ISS, quakes, fires, EONET, NWS, aircraft, buoys, GDACS) goes silently dead while the raster basemap still draws. `WorldMap.tsx` imports the worker with `?worker&url` and passes it to `maplibregl.setWorkerUrl()`. `tests/e2e/map-health.spec.ts` guards it by asserting the worker URL is served as JavaScript, not as the SPA fallback — a status check alone cannot catch this
- **Dependencies are updated by hand: `pnpm update`, then `pnpm verify`.** No Dependabot PRs since #33.
  - **Re-check every hold against the registry when updating; never keep a pin just to keep it (owner, 2026-11-06).** A hold stays only while a primary source still shows the block. #96 dropped the undici override (wrangler 4.158's miniflare ships the fixed undici 7.30.1) and the Dependabot-era `minimumReleaseAgeExclude` block.
  - **Two TypeScripts, on purpose (#97).** This is Microsoft's documented side-by-side setup from the TypeScript 7.0 announcement.
    - `typescript` is `npm:@typescript/typescript6`, a wrapper that resolves to the newest TS 6, for typescript-eslint. Its peer range is `>=4.8.4 <6.1.0` on both latest and canary, because TS 7.0 ships no programmatic API ("We expect TypeScript 7.1 to ship with a new (and different) API"). The maintainers told users to stay on TS 6 (typescript-eslint#12518).
    - `@typescript/native` is `npm:typescript@^7`, the Go compiler. It provides the `tsc` that `pnpm typecheck` and `pnpm build` run. A clean `tsc -b --noEmit` takes 0.39 s on TS 7 against 2.99 s on TS 6.
    - Check `node -e "console.log(require('typescript').version)"`: it must print 6.x.
    - When typescript-eslint ships TS 7.1 support (typescript-eslint#10940, PR #12803), drop the wrapper and make `typescript` plain TS 7.
  - `three` and `@types/three` are exact pins because three.js doesn't use semver: every release (r187 = 0.187.0) can break. Bump them together and read the wiki Migration Guide section for that release.
  - `pnpm-workspace.yaml` holds the accepted advisory list (`auditConfig.ignoreGhsas`, empty since #97) plus any `overrides`. Each entry carries why it can't be fixed and when to look again.
  - `@types/node` follows the Node the scripts run on in GitHub Actions (`node-version` in `data-refresh.yml`, currently 26, the active LTS). Bump the two together.
  - **pnpm 12 (#97).**
    - It reads settings only from `pnpm-workspace.yaml`; package.json's `pnpm` field is ignored.
    - Install scripts are allowed per package in `allowBuilds`, currently esbuild, sharp and workerd. An undeclared one fails the install.
    - It is a native binary. A machine whose global pnpm is older can't self-switch to it (`ENOEXEC` on the placeholder `bin/pnpm`), so upgrade the global one with `brew upgrade pnpm`.
    - **`minimumReleaseAge` defaults to one day.** Install refuses lockfile entries published less than a day ago (`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`), and `pnpm update` picks the newest version that is at least a day old. Keep it: it is a supply-chain guard. If a fresh release is needed urgently, wait the day rather than exempting it.
- **`scripts/check-health.mjs` retries transient failures only.** Status 0, 5xx and 429 get 3 attempts with 2s/5s backoff, because a single slow upstream used to fail the workflow and page Discord — `fetchUpstream`'s deadline is 8 s, so an upstream slower than that becomes our 503. Content-contract failures (missing fields, `X-Data-Degraded`, `X-Error-Kind: contract`) are never retried: they mean upstream shape drift, which is the thing the check exists to catch, and retrying would only delay the alert
- **A retry inside the negative cache is not a retry.** `_cache.ts` negative-caches a failure for 60 s, so the 2 s / 5 s backoff above only replayed one cached error. From #16 until #21, every "after 3 attempts" failure took about 70 ms and never reached the upstream. A response with `X-Cache: NEG` now waits 65 s before the next attempt. Retry any cached endpoint past its cache window
- **`X-Error-Kind` says why a handler failed.**
  - `contractError()` (500, `contract`) is for a payload that broke our schema or parsed to nothing. It means shape drift.
  - `upstreamError()` (`upstream`) is for an unavailable upstream.
  - **Never answer with 502 or 504 (#61).** On the custom domain Cloudflare replaces an origin 502/504 with its own plain "error code: 502" page, dropping the JSON body and `X-Error-Kind`. pages.dev previews do not, so a preview can look fine while production hides the error kind. Only Enterprise zones can turn it off. `tests/unit/error-kind-contract.test.ts` scans every function for a 502 or 504 status.
- **Stale-while-revalidate and stale-if-error.**
  - `cachedJson` stores positive entries for TTL + 24 h and decides freshness from `X-Cached-At`.
  - **An expired entry answers at once (#83)** as a 200 with `X-Cache: REVALIDATING` and `max-age=0`, while `produce()` runs in `waitUntil`. A low-traffic site usually finds its entry expired, so visitors used to wait for NASA or NOAA on most loads. It lives in our cache code, not the CDN's `stale-while-revalidate` directive: browsers obey that directive too, and previews can't exercise it.
  - The client's `apiFetch` (every `src/lib/api` fetcher uses it) notices a REVALIDATING answer, and `main.tsx` refetches the active queries 10 s later, once the fresh copy has landed. A new fetcher must use `apiFetch` or `getJson`, never bare `fetch`.
  - When the background refresh fails, it writes the neg entry, and the next request gets the last good body as a 200 with `X-Cache: STALE`, `X-Data-Age`, `X-Stale-Status` and `X-Error-Kind`.
  - The health check re-asks 12 s after a REVALIDATING answer and judges the second one. Judged as is, an outage would pass every run and never alert.
  - Because visitors no longer wait for the upstream, the probe's own time says nothing about it. Every positive entry stores `X-Produce-Ms`, how long its producer took, and the health check WARNs when a HIT or MISS says more than 3 s (#86). Like every WARN, it only comments on an already-open incident issue (and keeps it open); otherwise it shows only in the run's table.
  - `staleIfError: false` (inner raw-feed caches) turns both fallbacks off.
  - The health check passes an upstream-caused STALE with a WARN for up to 2 h. It fails a STALE caused by a contract failure, or one older than 2 h.
  - Per-colo and evictable like the rest of the Cache API, so this is best effort, not a guarantee.
- **Alerts are GitHub issues.** Both data-refresh jobs write `incident-report.json`, and `scripts/report-incidents.mjs` keeps one `incident`-labelled issue per source (`[observatory] health:/api/eonet`).
  - Open on failure, comment while still failing, auto-close on recovery, reopen on recurrence.
  - Discord pings on open, reopen and close, with the issue link.
  - A WARN entry (tolerated: STALE inside grace, a young KV copy) comments but does not close.
  - **An upstream-caused health failure opens only on its 4th run in a row (#71, owner's call), about 18-24 h in.** It counts as upstream only when our handler said `X-Error-Kind: upstream` (on its 503, degraded answer or STALE) and the body passed its contract. Drift, our own errors and a timeout reaching our site still open on the first run. A handler that answers degraded must set `X-Error-Kind` (and `X-Data-Source`) to say why, as `donki.ts` does, or its outages page at once. The streak is `incident-streaks.json` in actions/cache; losing it only restarts the count.
  - The label listing lags issue creation by seconds, so back-to-back manual runs can open a duplicate.
- **The KV refresh pages on staleness, not on one missed fetch.** A failed source counts only once its KV copy is past its max age: ISS and satellites 36 h, launches backup 48 h. The refresh runs every 6 h. Rejected payloads are logged with their keys plus a 300-character excerpt
- **`tests/unit/ci-contract.test.ts` guards the gate.**
  - It asserts that `pnpm verify` runs every check, using `test:coverage` because `vitest.config.ts` enforces thresholds.
  - It asserts that `packageManager` pins pnpm, and that every `pnpm <script>` a remaining workflow invokes exists.
  - Dropping a check from `verify` drops it entirely, because nothing else runs it.
- **Design system (ROCI v2, #36): colours have exactly two sources.**
  - `src/styles/tokens.css` holds the CSS tokens.
  - `src/lib/palette.ts` holds the data colours. It emits hex, because MapLibre's parser rejects `oklch()`.
  - `src/styles/palette.css` is **generated** from `palette.ts`. A unit test fails on drift. Regenerate with `pnpm exec vitest run tests/unit/palette.test.ts -u`, and never hand-edit it.
  - Severity thresholds live in `src/lib/severity.ts` only.
- **Page layout follows the approved prototype (#63), not the v1 layout.**
  - The prototype is `docs/design-history/mockups-v2.html` (Artifact WWKYsvhmPRvs4wyZ9WC1BE).
  - Layout: `HeaderPlate`, then a grid in `App.module.css` of the dial rail, the lens and the console column, with each console's remaining panels below.
  - Each console exports `Lead` and `Rest` (`consoleParts.ts`). `ConsoleVoice` writes the view's one Fraunces sentence from live data (`src/lib/voice.ts`).
  - The globe is sized by `useLensSize`, and `GlobeRenderer.resize()` keeps the one WebGL context.
  - VitalsSpine, BelterHeader and the Station Telemetry plate are gone on purpose.
  - Under 900px the dial is a fixed bottom bar, a deliberate deviation from the prototype: `mobile.spec` needs it in view.
- **`design-lint.json` decides where the colour-literal and 11px type-floor lint applies.** Add a directory when its reskin lands. Both stylelint and ESLint read it.
- **CARTO dark-matter's `background` layer is the land; water is a fill on top of it.** `src/lib/basemap.ts` repaints those vector layers on `style.load`. Never grade the map with a CSS `filter`: it recolours every data layer. `tests/e2e/map-renders.spec.ts` guards this.
- **WebGL nameplates skip the depth test, so occlusion must run BEFORE the draw (#60).** Satellite and ISS nameplate sprites use `depthTest: false` (otherwise the nearer Earth clips the name), and `updateOcclusion` hides the ones behind the Earth. `GlobeRenderer.syncOcclusion()` runs before every `render`, and plates are created `visible = false`. Running it after the draw, plus App handing over a fresh `[]` at 5 Hz (which rebuilt every plate), made back-side satellites strobe through the Earth. Keep layer props stable (shared empty arrays, `orNone` in GlobeHost), and keep satellites moving in place (`moveSpacecraft`), not rebuilding. Guarded by `globe-renderer.test.ts` (#60 block, incl. a limb-crossing check per drawn pose) and the `data-globe-builds` e2e in `globe-parity.spec.ts`
- **Bloom (#50) is high tier only, and `pnpm verify` never draws it.** Headless Playwright runs on SwiftShader, which `gpuTier` calls low tier (sprites); `globe-webgl.spec` asserts that. Any change to `three/bloom.ts` needs a look on a real GPU: launch Playwright chromium headless with `--use-angle=metal --enable-gpu --ignore-gpu-blocklist` and check `data-globe-bloom="bloom"`. Never use `UnrealBloomPass.renderToScreen` here: it clears the canvas and copies its input first, which wiped the Earth. `bloom.ts` runs the pass offscreen and adds only the blur. City lights bloom through a depth-writing Earth twin (`earthBloomFragment`), which also keeps far-side glows hidden
- **Expand (#89) is a CSS full-screen lens, not the Fullscreen API** (iPhone Safari has element fullscreen for video only). `useLensExpand` locks scroll, handles Esc and returns focus, and marks the document outside the app root `inert`; `App.tsx` marks its own siblings of the lens `inert`. The page rises above the fixed ticker as a whole (it is an isolated stacking context), and the lens above the phone's dial bar. Expanded, `globeSizeFor` drops the 760px cap, SunStage keeps the disc's share of the stage, and the map takes the screen height. The globe keeps its one canvas (`e2e/expand.spec.ts`). A new stage takes `size` from `useLensSize` and gets the button for free.
- **The `entry-gzip` budget is first-load JavaScript: the entry plus every chunk `index.html` modulepreloads (#75).** Lazy-loading part of the app makes Vite split the code it shares with the entry into a chunk the entry imports statically, so measuring the entry file alone under-reported by about 40 kB. The console `Rest` panels (`*ConsoleRest.tsx`) and the SVG globe's land data (`markers/landRings.ts`) load lazily. A new below-the-fold panel goes in a `Rest` file, not a `Lead` one
- **The Earth textures start with the page, small pair first (#85).** `index.html` preloads `day-2048.webp` and `night-2048.webp` on screens 900px and wider only (`media`): on a 4G phone the early 310 kB delayed the app's first paint by ~160 ms. For the same reason there is no `Link` header for them, which can't be limited by screen size, so they get no Early Hint. Narrower screens get the same links from `preloadTextures` (`src/lib/texturePreload.ts`) when GlobeHost starts the renderer import (#87): that is after first paint, and without it the pictures waited ~430 ms for the chunk to finish. An SVG-only visitor never downloads them. Every tier draws 2048 first; only the high tier then loads 4096 and swaps it in (`globeTextures` in `src/lib/globe3d.ts`, `upgradeTextures` in `GlobeRenderer`). Never preload 4096: the tier is picked at runtime. The preloads carry `crossorigin` because three's `TextureLoader` requests in CORS mode; drop either side and every visitor downloads the file twice. `texture-preload.test.ts` pins all of this. The canvas's `data-globe-textures` says which pair is drawn
- **Component tests (`*.test.tsx`) must call `afterEach(cleanup)`.** Vitest runs with `globals: false`, so Testing Library's auto-cleanup never registers and renders pile up between tests.
- **satellite.js 7: the multi-thread WASM build is stubbed out, and SGP4 loads on first use (#97).**
  - **The stub.** v7's barrel (`export * from './wasm/index.js'`) puts its multi-thread WASM build in the module graph even though the app never calls it. That build uses top-level await, which caused both of the problems below.
    - **The old IIFE build error:** "Module format "iife" does not support top-level await" when building its pthread worker. This is why it sat on v5 until #97.
    - **The first-load split:** the page's first-load code went from 4 chunks to 18. That happened even with satellite.js lazy, and `worker.format: 'es'` alone fixed only the error.
    - The fix: `vite.config.ts` aliases `#wasm-multi-thread` to `src/lib/orbit/bulk/noMultiThread.ts`, a stub that throws. Our page sends no COOP/COEP headers, so the multi-thread runtime could never run here anyway.
  - **SGP4 loads with the first orbit, not with the page.** `useIss` and `useSatellites` get the propagation module from `usePropagate` (`src/lib/orbit/loadPropagate.ts`), a cached dynamic import that starts once a TLE has arrived. The `propagate` chunk plus the satellite.js chunk come to about 11 kB gzip, and their download overlaps the TLE fetch.
    - Never import `@/lib/orbit/propagate` statically from first-load code. `check-bundle`'s `entry-has-no-sgp4` rule fails the gate if satellite.js reaches the first load, matching the minified `SatRecError` name `SemiLatusRectumBelowZero`.
    - First load measured: 159.6 kB on v5, 164.5 kB in 18 chunks on v7 with neither fix, 148.8 kB in 4 chunks now.
  - `propagate()` returns `null` when SGP4 fails (decayed, bad elements), and `satrec.error` says why.
  - **Bulk SGP4 for #98** lives in `src/lib/orbit/bulk/`: `BulkPropagator` on the single-thread WASM runtime, inside a worker.
    - The runtime embeds its WASM, so it needs no extra asset and no COOP/COEP. The worker builds to one file of about 44 kB gzip in the default IIFE format.
    - It matches the JS `propagate` to under a metre, and an SGP4 error comes out as NaN.
  - `passes.ts` uses v7's `shadowFraction`/`sunPos` cone, which matched our old cylinder test on all 25,920 ISS samples over 3 days. `tonight.ts` keeps its own Sun (agreement 0.0011°). `tests/unit/sat7-compare.test.ts` holds both claims.
- KV bindings in wrangler.toml are auto-wired by Cloudflare Pages — no manual dashboard step needed
- Never use `wrangler pages project create` — creates a Direct Upload project with no GitHub integration; always use the Cloudflare dashboard
- Fonts are self-hosted in `public/fonts/` (woff2 latin subset) — do not re-add Google Fonts CDN links; `font-src 'self'` CSP depends on this
- **Verify a downloaded font is actually a font**: `special-elite-latin.woff2` shipped for months as a 1.6 KB Google 404 HTML page. Check the magic bytes are `wOF2` (`head -c 4 file | xxd -p` = `774f4632`)
- `functions/` is typechecked via `tsconfig.functions.json` with `lib: ["ES2022"]` and **no DOM lib** — workers-types `Response`/`Request` collide with `lib.dom`
- Standalone `tsc` on individual files needs `--ignoreConfig` (TypeScript 6 and 7 alike), or it refuses to run because `tsconfig.json` exists (TS5112)
- `_cache.ts` lookup order is the positive key then `${key}:neg`, so a 60 s negative entry can never shadow fresh data. A non-ok producer `Response` is an error; a 2xx one is an uncached passthrough (unused since launches went KV-first in #30)
- Never proxy an upstream status code: `upstreamError()` is always 503, with the upstream status in `X-Upstream-Status`, so a NASA 429 is not mistaken for ours
- **The console's CSP error for an inline `/cdn-cgi/challenge-platform/scripts/jsd/main.js` loader is expected and harmless (#67, checked 2026-10-25).** It is Cloudflare JavaScript Detections (zone `bot_management.enable_js: true`), injected into every HTML page. Our `script-src` blocks it, so no JS-detection score is set, and no rule on the zone reads one (only the `.php` block, the `/api/` rate limit and cache rules), and the free plan never enforces on it. Don't "fix" it in the CSP: the snippet carries a per-request ray id and timestamp, so a hash can't match, and a nonce would need a static, public value or a Function on HTML routes (`_routes.json` forbids that). To silence it, turn `enable_js` off for the zone instead; that changes every site on geektechlive.com, so ask first
- **Open-Meteo is called straight from the browser (#79), only after the user shares a location.** It needs `https://api.open-meteo.com` in `connect-src` (a unit test checks it, because dev ignores `_headers`). It sees the visitor's IP and the location rounded to 0.1°, and the Tonight panel says so. Its free API is for non-commercial use only, and the limits are per IP (10,000/day), so don't proxy it through a Function: that would put every visitor on Cloudflare's shared egress limit
- Cloudflare's auto-injected Web Analytics beacon needs BOTH `https://static.cloudflareinsights.com` in `script-src` (to load) and `https://cloudflareinsights.com` in `connect-src` (to report). It posts to the absolute URL `https://cloudflareinsights.com/cdn-cgi/rum`, not to our own origin, so allowing only the script host loads the beacon and then silently blocks every beacon it sends. Verified in a browser, 2026-09-08

## Workflow

The same standard as Endless Noir (see the global `CLAUDE.md`):

- Material work starts as a GitHub issue labelled with an area (`infra`, …) and a priority `P0`–`P3`.
- It is done in a worktree under `.claude/worktrees/<name>` (gitignored), with `pnpm install --frozen-lockfile` first.
- Tests come first (RED, then GREEN), with one commit per unit that references its issue.
- `pnpm verify` passes in the worktree.
- **No PRs, no CI** (#33). To land:
  1. Fetch, rebase the worktree branch onto `origin/main`, and re-run `pnpm verify`. Two changes can each pass alone and break together.
  2. Leave the worktree. In the main checkout, `git pull`, then `git merge --squash <branch>`, then commit with `Closes #N, closes #M` (one keyword per issue) and push.
  3. Remove the worktree and the branch.
- A push to `main` deploys to production immediately. When a change deserves a look first, push the branch for a Cloudflare preview URL before merging. Roll back with `git revert`, or to the previous Pages deployment.
- A PR is only for when the owner wants to review something before it goes live.

## Local secrets

Create `.dev.vars` (gitignored) for local Pages Functions dev:

```
NASA_API_KEY=your_key_here
FIRMS_MAP_KEY=your_key_here
OPENAQ_API_KEY=your_key_here
```

## GitHub Actions secrets

`.github/workflows/data-refresh.yml` needs `CLOUDFLARE_API_TOKEN` (scoped to Workers KV Storage: Edit), `CLOUDFLARE_ACCOUNT_ID`, and `DISCORD_BOT_TOKEN` + `DISCORD_CHANNEL_ID` for failure alerts.

## Attribution

Port of cosmo-tui by @irahulstomar — credit surfaces in StatusBar AboutPopover, Footer, and README (Phase 3).
