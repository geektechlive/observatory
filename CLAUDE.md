# observatory

> See /Users/chrisfavero/Source/CLAUDE.md for global conventions

NASA live-data dashboard — port of cosmo-tui. Glass / Luxury Futurist aesthetic, ops-grade density.

## Stack

Vite 8 + React 19 + TypeScript 6 strict · Cloudflare Pages + Pages Functions + Workers KV · pnpm

## Key commands

- `pnpm dev` — local Vite dev server
- `pnpm pages:dev` — local dev with Pages Functions (KV, env vars via .dev.vars)
- `pnpm build` — production build to dist/
- `pnpm lint` — ESLint + stylelint
- `pnpm typecheck` — tsc strict check

## Phase status

- Phase 1 (scaffold + infra): **complete**
- Phase 2 (map + ISS): **complete** — MapLibre + EONET markers + ISS live tracker
- Phase 3 (panels + ticker): **complete** — all 6 panels, ticker, footer, App.tsx wired
- Phase 4 (security + polish): **complete** — self-hosted fonts, CSP, OG/meta/favicon, AboutPopover, ApiQuotaMeter, quota tracking, code-split (WorldMap lazy), tests (unit + e2e), CI (3-job workflow)
- Phase 5 (The Instrument): **complete** — stage/console shell, OrbitalDial, 20-endpoint data buildout
- Phase 6 (map layers): **complete** — NWS alerts, aircraft, buoys, OVATION aurora, FIRMS fires, OpenAQ
- Phase 7 (audit remediation, 2026-09-07): **complete** — see "Free-tier budget" and "Data feeds" below
- Phase 8 (dependency + CI remediation, 2026-09-09): **complete** — CI had been red on every branch including `main` since 2026-06-20 (`pnpm/action-setup` with no `packageManager`); fixed, plus maplibre-gl 6.9.0 for a critical XSS, 30 advisories down to 1, and required status checks on `main` so a dead pipeline blocks merges instead of going quiet

## Free-tier budget (hard constraint)

This runs on the Cloudflare free plan and must stay there. Treat these as rules, not guidance:

- **Never write KV on a request path.** 1,000 writes/day. All KV writes happen out-of-band in `scripts/refresh-data.mjs` via GitHub Actions. A per-request KV write once exhausted the budget in hours.
- **`public/_routes.json` restricts Functions to `/api/*`.** Without it every static asset invokes the Worker. Do not widen it.
- **Response caching is the Cloudflare Cache API (`caches.default`), not KV** — free and unmetered, but per-colo and evictable. KV is only for durable fallbacks.
- **Serve third-party assets directly** (CSP allowlist) rather than proxying through a Function. EPIC images are loaded straight from NASA for this reason.
- Worker CPU is 10 ms per invocation, so parse small feeds: prefer NOAA's 6.5 KB one-hour product over the 1.1 MB full feed.

## Data feeds

- **CelesTrak is unreachable from Cloudflare Workers egress** (522 since ~2026-09-03) though it works from anywhere else. `/api/iss-tle` and `/api/satellites` are KV-first: a GitHub Action fetches and validates TLEs from a normal network and writes `tle:iss:v1` / `tle:satellites:v1`. The handlers fall back to live CelesTrak, then a hardcoded `FALLBACK_TLE`.
- **NOAA SWPC feed drift (2026-09):** `noaa-planetary-k-index.json` became an array of objects, and `solar-wind/{plasma,mag}-7-day.json` returned 404. Solar wind and Bz now come from `products/geospace/propagated-solar-wind-1-hour.json` via the shared `functions/api/_swpc.ts`. Its cells are numbers, not numeric strings.
- **Upstream drift is silent by default.** A feed that changes shape yields an empty-but-HTTP-200 payload. `src/lib/health.ts` gives every source a content contract so this reads as an error, and `scripts/check-health.mjs` probes the headline endpoints on a schedule.

## Gotchas

- CSS modules use `localsConvention: 'camelCase'` — class names in `.module.css` must be camelCase
- `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`: CSS module lookups are `string | undefined`; use `?? ''` and `?: string | undefined` in props
- Stylelint disables: `color-function-notation`, `property-no-vendor-prefix`, `selector-class-pattern` — intentional, see stylelint.config.js
- **`@keyframes` blocks**: always put an empty line between each keyframe selector (`0%`, `50%`, `from`, `to`) — CI Linux stylelint enforces `rule-empty-line-before` more strictly than macOS; the pre-commit hook may not catch it locally
- **maplibre-gl 6 needs `setWorkerUrl` wired by hand.** v6 is ESM-only and resolves its worker at runtime via `new URL('./maplibre-gl-worker.mjs', import.meta.url)` — a form no bundler detects statically, so Vite emits no worker asset and the request falls through to the SPA's `index.html`: **HTTP 200, no console error**. GeoJSON sources are parsed in that worker, so every vector layer (ISS, quakes, fires, EONET, NWS, aircraft, buoys, GDACS) goes silently dead while the raster basemap still draws. `WorldMap.tsx` imports the worker with `?worker&url` and passes it to `maplibregl.setWorkerUrl()`. `tests/e2e/map-health.spec.ts` guards it by asserting the worker URL is served as JavaScript, not as the SPA fallback — a status check alone cannot catch this
- **`pnpm/action-setup` needs `packageManager` in package.json.** Without it (or an explicit `version:`) it fails with `No pnpm version is specified` before any dependency installs — every job, every branch. `tests/unit/ci-contract.test.ts` asserts the field exists, and that every `pnpm <script>` a workflow invokes is a real package script
- `satellite.js` pinned to v5 — v7 ships a WASM/pthreads build with top-level await that Vite/rolldown cannot bundle as iife; v5 pure-JS is more than sufficient for 5Hz SGP4 propagation
- KV bindings in wrangler.toml are auto-wired by Cloudflare Pages — no manual dashboard step needed
- Never use `wrangler pages project create` — creates a Direct Upload project with no GitHub integration; always use the Cloudflare dashboard
- Fonts are self-hosted in `public/fonts/` (woff2 latin subset) — do not re-add Google Fonts CDN links; `font-src 'self'` CSP depends on this
- **Verify a downloaded font is actually a font**: `special-elite-latin.woff2` shipped for months as a 1.6 KB Google 404 HTML page. Check the magic bytes are `wOF2` (`head -c 4 file | xxd -p` = `774f4632`)
- `functions/` is typechecked via `tsconfig.functions.json` with `lib: ["ES2022"]` and **no DOM lib** — workers-types `Response`/`Request` collide with `lib.dom`
- Standalone `tsc` on individual files needs `--ignoreConfig` under TypeScript 6, or it refuses to run because `tsconfig.json` exists
- `_cache.ts` lookup order is the positive key then `${key}:neg`, so a 60 s negative entry can never shadow fresh data. A non-ok producer `Response` is an error; a 2xx one is an intentional uncached passthrough (the launches KV STALE path)
- Never proxy an upstream status code: `upstreamError()` maps 0 and >= 520 to 503 and everything else to 502, so a NASA 429 is not mistaken for ours
- Cloudflare's auto-injected Web Analytics beacon needs BOTH `https://static.cloudflareinsights.com` in `script-src` (to load) and `https://cloudflareinsights.com` in `connect-src` (to report). It posts to the absolute URL `https://cloudflareinsights.com/cdn-cgi/rum`, not to our own origin, so allowing only the script host loads the beacon and then silently blocks every beacon it sends. Verified in a browser, 2026-09-08

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
