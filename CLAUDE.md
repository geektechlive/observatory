# observatory

> See /Users/chrisfavero/Source/CLAUDE.md for global conventions.
> **Decisions → [`docs/decisions/`](docs/decisions/README.md).** Settled choices and why; read before re-proposing anything they cover. A new decision gets an ADR in the same change (template `0000-template.md`). ADRs are **public**: no secrets, account or zone IDs, email addresses or personal details (ADR 0016).
> **Details, measurements, history → [`docs/`](docs/README.md)**, by area. This file holds only rules, one-line gotchas and pointers (ADR 0015). Never add history or numbers here; add them to the reference doc and, if needed, a one-line rule here. `tests/unit/claude-md-size.test.ts` fails past 20 KB.
> **Visual change → read [`docs/design-history/roci-retrofit-v2.md`](docs/design-history/roci-retrofit-v2.md) first** (ROCI v2 "the Instrument", ADR 0005). The old "Glass / Luxury Futurist" direction is history only.

NASA live-data dashboard at observatory.geektechlive.com, a TypeScript web port of cosmo-tui, with a full-page 3D orrery.

## Stack

Vite 8 + React 19 + TypeScript 7 strict (6 for lint only, ADR 0006) · Cloudflare Pages + Pages Functions + Workers KV · one Durable Object Worker (`workers/jpl-queue/`) · pnpm 12

## Key commands

- `pnpm dev`: Vite dev server (ignores `public/_headers`, so no CSP).
- `pnpm build` then `pnpm pages:dev`: local Functions with KV and `.dev.vars`. `pages:dev` serves `dist/`, so rebuild after every edit.
- `pnpm lint`: ESLint (`--max-warnings 0`, #113) + stylelint.
- `pnpm typecheck`: `tsc` (TS 7).
- `pnpm verify`: **the gate before every merge to `main`**: lint, typecheck, unit tests with coverage thresholds, build with `check-bundle`, e2e, `pnpm audit --audit-level=high`. There is no CI (ADR 0001).
- `node scripts/og-image.mjs [baseURL]`: regenerate the share card ([docs/operations/share-card.md](docs/operations/share-card.md)).
- More: [docs/operations/local-dev.md](docs/operations/local-dev.md) (secrets, JPL queue locally, real-GPU Playwright).

## Free-plan rules (hard constraint, ADR 0002)

- **Never write KV on a request path.** 1,000 writes/day. All KV writes happen in `scripts/refresh-data.mjs` (GitHub Actions).
- **`public/_routes.json` restricts Functions to `/api/*`.** Do not widen it.
- **Response caching is the Cache API (`caches.default`, `functions/api/_cache.ts`), not KV.** KV is only for durable fallbacks.
- **Serve third-party assets directly** (CSP allowlist), never proxied through a Function.
- **Worker CPU is 10 ms per invocation:** parse small feeds; stream KV bodies through `_kvBody.ts` without parsing.
- Paid Cloudflare features are out. SQLite-backed Durable Objects are free (ADR 0010).

## Data and API rules

Details: [docs/reference/data-feeds-and-monitoring.md](docs/reference/data-feeds-and-monitoring.md).

- Upstreams that block Workers (CelesTrak, RocketLaunch.live) or need paced, authenticated or slow fetches (Horizons, CAD, Space-Track, DISCOSweb, APOD's page) are **KV-first from the refresh job** (ADR 0003, 0009).
- **JPL gets one request at a time from any caller.** Horizons 503s overlapping requests (#88). Visitor lookups go only through the `JplQueue` Durable Object (ADR 0010).
- **Every source has a content contract** in `src/lib/health.ts`; write the `required` predicate with the fetcher. HTTP 200 is not evidence of data (ADR 0004). The header judges each view by its own list, `VIEW_HEADLINES`: moving a headline feed between views, or adding a view, updates it (ADR 0018).
- **Never answer 502 or 504** (#61): the custom domain replaces the body. `upstreamError()` is 503 with `X-Upstream-Status`; `contractError()` is 500. A test scans `functions/`.
- **A handler that answers degraded must set `X-Error-Kind`** (and `X-Data-Source`), or its outages page at once.
- **Never proxy an upstream status code.**
- **A new client fetcher uses `apiFetch` or `getJson`, never bare `fetch`** (stale-while-revalidate refetch, #83).
- **When a fix changes what a cached endpoint returns, bump its cache key.**
- Retry infrastructure (0, 5xx, 429), never contracts; a retry against a cached endpoint must outlast the 60 s negative cache.
- The refresh job has one 6-minute deadline inside the 10-minute workflow timeout (#128); new steps respect `stepBudget`/`beforeDeadline`.
- Open-Meteo is called from the browser after the user shares a location; never proxy it (#79).
- Credentials (Space-Track, DISCOSweb) live only in Actions secrets and the login form or `Authorization` header: **never in a URL, error, log line, payload or fixture** (ADR 0013). **Never delete `spacetrack:history:v1`** (GP_HISTORY is once per lifetime). Every surface showing Space-Track data credits "Space-Track.org".
- Modules the Node refresh job imports (`src/lib/horizons.ts`, `src/lib/orrery/craft.ts`, `moons.ts`, `conic.ts`, `src/lib/orbit/satCatalog.ts`) **take no imports and use erasable syntax only.**
- The orrery client **interpolates, never extrapolates** its samples.

## Bundle and loading rules

Details: [docs/reference/bundle-and-loading.md](docs/reference/bundle-and-loading.md). Performance is at its floor: no further slow-phone squeezing unless real-visitor data shows a problem (ADR 0017).

- `check-bundle` budgets are tripwires. Raise a **lazy** chunk's budget in the upgrade commit that grows it, with the delta in the message; **flag a first-load (`entry-gzip`) rise to the owner** (ADR 0007).
- New below-the-fold console panels go in a `Rest` file, not `Lead`. A new lead panel needs a `reserve` class (no layout shift, #169).
- **Never import `@/lib/orbit/propagate` statically from first-load code** (`entry-has-no-sgp4`).
- **Keep orrery code out of `orreryPrefetch.ts`** and out of modules the entry imports (Space-Track hooks, `useSatelliteFacts.ts`, `satcatWords.ts`).
- **The satellite renderer never imports `satField.ts` or the API client.** The orrery renderer reads the clock through `ClockReader`, never the store.
- **No zod unions in client schemas** (they pull union code into the first load).
- `vite.config.ts`'s `vendor`/`app` `codeSplitting` groups keep the first load at 3 files; `vite-chunking.test.ts` pins them. Don't remove them.
- `orrery-preload.json` stays outside `/assets/` (that path is cached immutable).
- **Never preload the 4096 Earth textures**; texture preloads carry `crossorigin`.

## Gotchas

- CSS modules use `localsConvention: 'camelCase'`: class names in `.module.css` must be camelCase.
- `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`: CSS module lookups are `string | undefined`; use `?? ''` and `?: string | undefined` in props.
- Stylelint disables `color-function-notation`, `property-no-vendor-prefix`, `selector-class-pattern` on purpose (see `stylelint.config.js`).
- **`@keyframes`:** an empty line between each keyframe selector (`rule-empty-line-before`) and kebab-case names (`keyframes-name-pattern`).
- **Colours have two sources:** `src/styles/tokens.css` and `src/lib/palette.ts` (hex, because MapLibre rejects `oklch()`). `src/styles/palette.css` is generated: regenerate with `pnpm exec vitest run tests/unit/palette.test.ts -u`, never hand-edit. Severity thresholds live in `src/lib/severity.ts` only. `design-lint.json` scopes the colour and 11px type-floor lint.
- Cyan is spacecraft and telemetry only; MCRN red is hazard only.
- Layout follows the approved prototype (#63, `docs/design-history/mockups-v2.html`); under 900px the dial is a fixed bottom bar on purpose.
- **maplibre-gl 6 needs `setWorkerUrl` wired by hand** (`WorldMap.tsx`), or every vector layer dies silently behind an HTTP 200.
- **Credits that sources' terms require are licence terms:** the map's attribution control stays `compact: false`, a new map source with credit terms sets `attribution`, and a panel shows a credit its source asks for (#179).
- **Never grade the map with a CSS `filter`**: `src/lib/basemap.ts` repaints CARTO's layers.
- **Globe nameplates: occlusion runs BEFORE the draw** (`syncOcclusion`, #60). Keep layer props stable (shared empty arrays).
- **Bloom is high tier only and `pnpm verify` never draws it.** A change to `three/bloom.ts` needs a real-GPU look. Never use `UnrealBloomPass.renderToScreen`.
- Expand is a CSS full-screen lens, not the Fullscreen API (#89). A new stage takes `size` from `useLensSize`.
- **The orrery's renderer: `schedule()` is the only place a frame is requested** (#91 frame-loop leak).
- **No `'wasm-unsafe-eval'` in the CSP**: SGP4 runs in JS only (`check-bundle`'s `no-wasm`), and craft models are Draco-decoded at build time (ADR 0011).
- Craft silhouettes are our own paths: **never an agency logo or insignia.** Imagery credits live in `src/lib/orrery/imagery.ts` and `craftModels.ts`.
- `vite.config.ts` aliases satellite.js's `#wasm-multi-thread` to a stub; keep it: the build fails without it (#137).
- When a control the orrery guide explains changes, update `guide/sections.ts` in the same change.
- **CSP hosts dev can't check:** `api.open-meteo.com`, `services.swpc.noaa.gov` (img and connect) and both Cloudflare Insights hosts (`static.cloudflareinsights.com` in `script-src`, `cloudflareinsights.com` in `connect-src`) are pinned by unit tests.
- The console's CSP error for `/cdn-cgi/challenge-platform/.../jsd/main.js` is expected (#67). Don't "fix" it in the CSP; ask before turning off `enable_js` for the zone.
- Fonts are self-hosted in `public/fonts/`; never re-add Google Fonts. **Check a downloaded font's magic bytes are `wOF2`.**
- `functions/` is typechecked by `tsconfig.functions.json` with **no DOM lib**. Standalone `tsc` on one file needs `--ignoreConfig`.
- Component tests (`*.test.tsx`) must call `afterEach(cleanup)` (Vitest `globals: false`).
- Dependencies: `pnpm update` by hand, then `pnpm verify`. Re-check every hold against the registry and drop it unless a primary source still shows the block (ADR 0007). `three` and `@types/three` are exact pins, bumped together. `require('typescript').version` must print 6.x. pnpm reads settings only from `pnpm-workspace.yaml`; keep its one-day `minimumReleaseAge`. Details: [docs/reference/dependencies.md](docs/reference/dependencies.md).
- Never use `wrangler pages project create`; KV bindings in `wrangler.toml` are auto-wired.
- Never commit `docs/ORREY-CLAUDE-CODE-IMPLEMENTATION-SPECIFICATION.md`.
- Code comments point at `docs/`, not at sections of this file.

## Where things are documented

| Area                                                                        | Doc                                                                         |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Feeds, cache, health check, incident issues, refresh job                    | [data-feeds-and-monitoring.md](docs/reference/data-feeds-and-monitoring.md) |
| First load, chunking, prefetch, textures, layout shift                      | [bundle-and-loading.md](docs/reference/bundle-and-loading.md)               |
| Colours, layout, globe, map, fonts                                          | [globe-and-design.md](docs/reference/globe-and-design.md)                   |
| Orrery page, presets, labels, playback, links, guide, imagery, craft models | [orrery.md](docs/reference/orrery.md)                                       |
| Craft, moons, close approaches, Earth frame, comets, JPL queue              | [orrery-data.md](docs/reference/orrery-data.md)                             |
| Satellites, satellite browser, Space-Track, DISCOSweb, satellite.js         | [satellites.md](docs/reference/satellites.md)                               |
| Dependencies, TypeScripts, pnpm                                             | [dependencies.md](docs/reference/dependencies.md)                           |
| Landing, local dev, share card                                              | [docs/operations/](docs/operations/)                                        |
| Phases                                                                      | [history.md](docs/history.md)                                               |

## Workflow

Full runbook: [docs/operations/landing.md](docs/operations/landing.md). The same standard as Endless Noir (see the global `CLAUDE.md`).

- Material work starts as a GitHub issue with an area label and a priority `P0`–`P3`.
- Work in a worktree under `.claude/worktrees/<name>`, `pnpm install --frozen-lockfile` first.
- Tests first (RED, then GREEN); one commit per unit, referencing its issue.
- `pnpm verify` passes in the worktree. `tests/unit/ci-contract.test.ts` guards that it runs every check.
- **No PRs, no CI** (ADR 0001). Land: rebase onto `origin/main` and re-run `pnpm verify`; leave the worktree; in the main checkout `git pull`, `git merge --squash <branch>`, commit with `Closes #N`, push; remove the worktree and branch.
- **A push to `main` deploys to production.** Push the branch first for a preview when a change deserves a look. Roll back with `git revert` or the previous Pages deployment.

## Secrets

`.dev.vars` (gitignored) for local Functions: `NASA_API_KEY`, `FIRMS_MAP_KEY`, `OPENAQ_API_KEY`. GitHub Actions secrets for `data-refresh.yml`: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `DISCORD_BOT_TOKEN`, `DISCORD_CHANNEL_ID`, `SPACETRACK_USER`, `SPACETRACK_PASS`, `DISCOSWEB_TOKEN`. Details: [docs/operations/local-dev.md](docs/operations/local-dev.md).

## Attribution

Port of cosmo-tui by @irahulstomar; credit surfaces in the AboutPopover, Footer and README.
