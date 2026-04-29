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
- Phase 4 (security + polish): **in progress** — fonts, meta, OG, favicon, AboutPopover, ApiQuotaMeter done; Lighthouse + code-split pass remaining

## Gotchas

- CSS modules use `localsConvention: 'camelCase'` — class names in `.module.css` must be camelCase
- `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`: CSS module lookups are `string | undefined`; use `?? ''` and `?: string | undefined` in props
- Stylelint disables: `color-function-notation`, `property-no-vendor-prefix`, `selector-class-pattern` — intentional, see stylelint.config.js
- **`@keyframes` blocks**: always put an empty line between each keyframe selector (`0%`, `50%`, `from`, `to`) — CI Linux stylelint enforces `rule-empty-line-before` more strictly than macOS; the pre-commit hook may not catch it locally
- `satellite.js` pinned to v5 — v7 ships a WASM/pthreads build with top-level await that Vite/rolldown cannot bundle as iife; v5 pure-JS is more than sufficient for 5Hz SGP4 propagation
- KV bindings in wrangler.toml are auto-wired by Cloudflare Pages — no manual dashboard step needed
- Never use `wrangler pages project create` — creates a Direct Upload project with no GitHub integration; always use the Cloudflare dashboard
- Fonts are self-hosted in `public/fonts/` (woff2 latin subset) — do not re-add Google Fonts CDN links; `font-src 'self'` CSP depends on this

## Local secrets

Create `.dev.vars` (gitignored) for local Pages Functions dev:

```
NASA_API_KEY=your_key_here
```

## Attribution

Port of cosmo-tui by @irahulstomar — credit surfaces in StatusBar AboutPopover, Footer, and README (Phase 3).
