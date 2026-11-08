# 0002. Stay on the Cloudflare free plan, and design to its limits

Status: Accepted · Date: 2026-09-07

<!-- The Cache API part was decided 2026-06-19 (8e64d2a); the owner made the free plan a hard
constraint on 2026-09-07. -->

## Context

The site runs on Cloudflare Pages, Pages Functions and Workers KV, all on the free plan: 1,000 KV
writes a day, 100,000 Worker requests a day, 10 ms of CPU per invocation. On 2026-06-19 the
account reached 90% of the KV write limit: middleware wrote KV on every `/api/` request for rate
limiting, and each endpoint's KV cache TTL equalled its client refetch interval, so almost every
poll was a miss and a write. One open tab cost about 170 writes an hour. Later, Pages was routing
every request, static assets included, through the Worker, and EPIC images streamed 2.6 MB PNGs
through a Function.

## Decision

The owner, 2026-09-07: the site stays on the free plan, "a box we must stay within". The rules:

- Never write KV on a request path. All KV writes happen out of band, in
  `scripts/refresh-data.mjs` on a GitHub Actions schedule.
- Response caching is the Cache API (`caches.default`, through `functions/api/_cache.ts`), which
  is free and unmetered. KV holds only durable fallbacks.
- `public/_routes.json` limits Functions to `/api/*`.
- Third-party assets are served straight from their origin through the CSP allowlist, not
  proxied.
- Parse small feeds, because of the 10 ms CPU limit.

## Consequences

- Running cost stays at zero, and a traffic spike can't exhaust a write budget.
- The Cache API is per-colo and evictable, so a cold colo asks the upstream again, and anything
  that must survive an outage lives in KV, written by the refresh job.
- Before adding an endpoint or cache layer, state its per-request cost in invocations and KV
  writes; if either is nonzero per request, redesign.
- Paid features are out unless the owner decides otherwise. Durable Objects are usable because
  SQLite-backed ones are on the free plan ([ADR 0010](0010-on-demand-jpl-through-one-durable-object.md)).
- Revisit only if the owner chooses a paid plan.

## Evidence

- Commits 8e64d2a (Cache API, in-memory rate limit) and 47733f0 (`_routes.json`, direct
  assets).
- `functions/api/_cache.ts`, `public/_routes.json`, `scripts/refresh-data.mjs`.
- [reference/data-feeds-and-monitoring.md](../reference/data-feeds-and-monitoring.md).
