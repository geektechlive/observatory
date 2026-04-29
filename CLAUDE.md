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

- Phase 1 (scaffold + infra): **complete** — initial commit on main, live at observatory.geektechlive.com
- Phase 2 (map + ISS): **complete** — MapLibre + EONET markers + ISS live tracker shipped
- Phase 3 (panels + ticker): not started
- Phase 4 (security + polish): not started

## Gotchas

- CSS modules use `localsConvention: 'camelCase'` — class names in `.module.css` must be camelCase
- `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`: CSS module lookups are `string | undefined`; use `?? ''` and `?: string | undefined` in props
- Stylelint disables: `color-function-notation`, `property-no-vendor-prefix`, `selector-class-pattern` — intentional, see stylelint.config.js
- `_redirects` SPA rule removed — causes Cloudflare infinite loop warning; restore when TanStack Router added in Phase 3
- `satellite.js` pinned to v5 — v7 ships a WASM/pthreads build with top-level await that Vite/rolldown cannot bundle as iife; v5 pure-JS is more than sufficient for 5Hz SGP4 propagation
- KV bindings in wrangler.toml are auto-wired by Cloudflare Pages — no manual dashboard step needed
- Never use `wrangler pages project create` — creates a Direct Upload project with no GitHub integration; always use the Cloudflare dashboard

## Local secrets

Create `.dev.vars` (gitignored) for local Pages Functions dev:

```
NASA_API_KEY=your_key_here
```

## Attribution

Port of cosmo-tui by @irahulstomar — credit surfaces in StatusBar AboutPopover, Footer, and README (Phase 3).
