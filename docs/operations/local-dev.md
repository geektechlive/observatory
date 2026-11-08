# Local development

## Commands

- `pnpm dev`: the Vite dev server. It ignores `public/_headers`, so CSP problems don't show here.
- `pnpm build`, then `pnpm pages:dev`: local dev with Pages Functions (KV, env vars from
  `.dev.vars`). `pages:dev` serves `dist/`, not the source, so edits are invisible until
  `pnpm build` runs again.
- `pnpm preview`: the built site without Functions. It also ignores `_headers`, so it runs the
  satellite worker's WASM path where production runs JS ([satellites.md](../reference/satellites.md)).
- `pnpm verify`: the gate. See the workflow in [landing.md](landing.md).

## Local secrets

Create `.dev.vars` (gitignored) for local Pages Functions dev:

```
NASA_API_KEY=your_key_here
FIRMS_MAP_KEY=your_key_here
OPENAQ_API_KEY=your_key_here
```

The refresh job's dry runs read the owner's Space-Track and DISCOSweb credentials from
`~/.claude/secrets.env` (outside the repo). Never put a credential in a URL, a log line, a
payload or a test fixture.

## GitHub Actions secrets

`.github/workflows/data-refresh.yml` needs `CLOUDFLARE_API_TOKEN` (scoped to Workers KV Storage:
Edit), `CLOUDFLARE_ACCOUNT_ID`, and `DISCORD_BOT_TOKEN` + `DISCORD_CHANNEL_ID` for failure alerts.
`SPACETRACK_USER`, `SPACETRACK_PASS` and `DISCOSWEB_TOKEN` are the owner's Space-Track.org and ESA
DISCOSweb accounts (#101); without them those steps skip with a warning.

## Cloudflare Pages

- KV bindings in `wrangler.toml` are auto-wired by Cloudflare Pages; no dashboard step is needed.
- Never use `wrangler pages project create`: it creates a Direct Upload project with no GitHub
  integration. Use the Cloudflare dashboard.
- A push to `main` deploys to production; a pushed branch gets a pages.dev preview URL. Previews
  pass origin 502/504 bodies through where the custom domain does not
  ([data-feeds-and-monitoring.md](../reference/data-feeds-and-monitoring.md)).

## The JPL queue locally

`wrangler dev --config workers/jpl-queue/wrangler.toml --port 8790`, then
`wrangler pages dev dist --do JPL_QUEUE=JplQueue@observatory-jpl-queue`; the dev registry
connects them. Without the binding, `/api/lookup` and `/api/trajectory` answer 503 with
`X-Not-Configured: jpl-queue`.

## A real GPU in Playwright

Headless Playwright runs on SwiftShader, which the globe calls low tier, so `pnpm verify` never
draws bloom. To check bloom or capture a real frame, launch Playwright chromium headless with
`--use-angle=metal --enable-gpu --ignore-gpu-blocklist` and check `data-globe-bloom="bloom"`.
This needs a Mac.

## Tests

- Component tests (`*.test.tsx`) must call `afterEach(cleanup)`. Vitest runs with
  `globals: false`, so Testing Library's auto-cleanup never registers and renders pile up between
  tests.
- Run the e2e suite once per landing (it is part of `pnpm verify`); use the cheap checks while
  iterating.
