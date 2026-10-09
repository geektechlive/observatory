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
- **NOAA SWPC feed drift (2026-09):** `noaa-planetary-k-index.json` became an array of objects, and `solar-wind/{plasma,mag}-7-day.json` returned 404. Solar wind and Bz now come from `products/geospace/propagated-solar-wind-1-hour.json` via the shared `functions/api/_swpc.ts`. Its cells are numbers, not numeric strings.
- **Upstream drift is silent by default.** A feed that changes shape yields an empty-but-HTTP-200 payload. `src/lib/health.ts` gives every source a content contract so this reads as an error, and `scripts/check-health.mjs` probes the headline endpoints on a schedule.

## Gotchas

- CSS modules use `localsConvention: 'camelCase'` — class names in `.module.css` must be camelCase
- `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`: CSS module lookups are `string | undefined`; use `?? ''` and `?: string | undefined` in props
- Stylelint disables: `color-function-notation`, `property-no-vendor-prefix`, `selector-class-pattern` — intentional, see stylelint.config.js
- **`@keyframes` blocks**: always put an empty line between each keyframe selector (`0%`, `50%`, `from`, `to`) — CI Linux stylelint enforces `rule-empty-line-before` more strictly than macOS; the pre-commit hook may not catch it locally
- **maplibre-gl 6 needs `setWorkerUrl` wired by hand.** v6 is ESM-only and resolves its worker at runtime via `new URL('./maplibre-gl-worker.mjs', import.meta.url)` — a form no bundler detects statically, so Vite emits no worker asset and the request falls through to the SPA's `index.html`: **HTTP 200, no console error**. GeoJSON sources are parsed in that worker, so every vector layer (ISS, quakes, fires, EONET, NWS, aircraft, buoys, GDACS) goes silently dead while the raster basemap still draws. `WorldMap.tsx` imports the worker with `?worker&url` and passes it to `maplibregl.setWorkerUrl()`. `tests/e2e/map-health.spec.ts` guards it by asserting the worker URL is served as JavaScript, not as the SPA fallback — a status check alone cannot catch this
- **Dependencies are updated by hand: `pnpm update`, then `pnpm verify`.** No Dependabot PRs since #33.
  - Two majors are held on purpose: `satellite.js` stays on v5 (below), and `typescript` stays on 6 because typescript-eslint's peer range is `>=4.8.4 <6.1.0`. The peer range forbids the bump; it isn't a judgement call.
  - `pnpm-workspace.yaml` `minimumReleaseAgeExclude` dates from Dependabot's 3-day cooldown, which pnpm applies graph-wide. It is inert without Dependabot and harmless to keep. pnpm reads that setting only from `pnpm-workspace.yaml`, never `package.json`, and doesn't warn.
  - `auditConfig.ignoreGhsas` in the same file is the only accepted advisory list. Each entry carries why it can't be fixed and when to look again.
- **`scripts/check-health.mjs` retries transient failures only.** Status 0, 5xx and 429 get 3 attempts with 2s/5s backoff, because a single slow upstream used to fail the workflow and page Discord — `fetchUpstream`'s deadline is 8 s, so an upstream slower than that becomes our 503. Content-contract failures (missing fields, `X-Data-Degraded`, `X-Error-Kind: contract`) are never retried: they mean upstream shape drift, which is the thing the check exists to catch, and retrying would only delay the alert
- **A retry inside the negative cache is not a retry.** `_cache.ts` negative-caches a failure for 60 s, so the 2 s / 5 s backoff above only replayed one cached error. From #16 until #21, every "after 3 attempts" failure took about 70 ms and never reached the upstream. A response with `X-Cache: NEG` now waits 65 s before the next attempt. Retry any cached endpoint past its cache window
- **`X-Error-Kind` says why a handler failed.**
  - `contractError()` (502, `contract`) is for a payload that broke our schema or parsed to nothing. It means shape drift.
  - `upstreamError()` (`upstream`) is for an unavailable upstream.
  - Never return `upstreamError(502, …)`. `tests/unit/error-kind-contract.test.ts` scans every handler for it, because that would make drift look like an outage.
- **Stale-if-error.**
  - `cachedJson` stores positive entries for TTL + 24 h and decides freshness from `X-Cached-At`.
  - When the producer fails (or a neg entry is live), the last good body goes out as a 200 with `X-Cache: STALE`, `X-Data-Age`, `X-Stale-Status` and `X-Error-Kind`.
  - The health check passes an upstream-caused STALE with a WARN for up to 2 h. It fails a STALE caused by a contract failure, or one older than 2 h.
  - Per-colo and evictable like the rest of the Cache API, so this is best effort, not a guarantee.
- **Alerts are GitHub issues.** Both data-refresh jobs write `incident-report.json`, and `scripts/report-incidents.mjs` keeps one `incident`-labelled issue per source (`[observatory] health:/api/eonet`).
  - Open on failure, comment while still failing, auto-close on recovery, reopen on recurrence.
  - Discord pings on open, reopen and close, with the issue link.
  - A WARN entry (tolerated: STALE inside grace, a young KV copy) comments but does not close.
  - The label listing lags issue creation by seconds, so back-to-back manual runs can open a duplicate.
- **The KV refresh pages on staleness, not on one missed fetch.** A failed source counts only once its KV copy is past its max age: ISS and satellites 36 h, launches backup 48 h. The refresh runs every 6 h. Rejected payloads are logged with their keys plus a 300-character excerpt
- **`tests/unit/ci-contract.test.ts` guards the gate.**
  - It asserts that `pnpm verify` runs every check, using `test:coverage` because `vitest.config.ts` enforces thresholds.
  - It asserts that `packageManager` pins pnpm, and that every `pnpm <script>` a remaining workflow invokes exists.
  - Dropping a check from `verify` drops it entirely, because nothing else runs it.
- `satellite.js` pinned to v5 — v7 ships a WASM/pthreads build with top-level await that Vite/rolldown cannot bundle as iife; v5 pure-JS is more than sufficient for 5Hz SGP4 propagation
- KV bindings in wrangler.toml are auto-wired by Cloudflare Pages — no manual dashboard step needed
- Never use `wrangler pages project create` — creates a Direct Upload project with no GitHub integration; always use the Cloudflare dashboard
- Fonts are self-hosted in `public/fonts/` (woff2 latin subset) — do not re-add Google Fonts CDN links; `font-src 'self'` CSP depends on this
- **Verify a downloaded font is actually a font**: `special-elite-latin.woff2` shipped for months as a 1.6 KB Google 404 HTML page. Check the magic bytes are `wOF2` (`head -c 4 file | xxd -p` = `774f4632`)
- `functions/` is typechecked via `tsconfig.functions.json` with `lib: ["ES2022"]` and **no DOM lib** — workers-types `Response`/`Request` collide with `lib.dom`
- Standalone `tsc` on individual files needs `--ignoreConfig` under TypeScript 6, or it refuses to run because `tsconfig.json` exists
- `_cache.ts` lookup order is the positive key then `${key}:neg`, so a 60 s negative entry can never shadow fresh data. A non-ok producer `Response` is an error; a 2xx one is an uncached passthrough (unused since launches went KV-first in #30)
- Never proxy an upstream status code: `upstreamError()` maps 0 and >= 520 to 503 and everything else to 502, so a NASA 429 is not mistaken for ours
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
