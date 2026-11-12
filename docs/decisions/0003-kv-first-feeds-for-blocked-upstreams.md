# 0003. Upstreams that block Workers are served KV-first from the refresh job

Status: Accepted · Date: recorded 2026-11-08, decided earlier (CelesTrak 2026-09-07, launches 2026-10-09, APOD 2026-10-25)

## Context

Some upstreams refuse Cloudflare Workers egress while answering any ordinary network: CelesTrak
returns 522 (since about 2026-09-03), and RocketLaunch.live fails from Workers (#30). APOD moved
to science.nasa.gov, and NASA's APOD API kept scraping the old page, returning the title "NASA
Science" and the NASA logo as the picture (#72). A Function can't fix any of these on the request
path.

## Decision

For such sources, a GitHub Actions job (`scripts/refresh-data.mjs`) fetches and validates the
data from a normal network and writes it to KV. The Function serves the KV copy first while it is
young enough, then tries the live upstream, then serves the older copy marked degraded (or a
hardcoded fallback TLE). The same pattern later carried every heavy or paced source: Horizons,
CAD, CelesTrak groups, Space-Track and DISCOSweb.

## Consequences

- Visitors get data even when the upstream refuses Cloudflare, and the paced, authenticated or
  slow fetches never sit on a request path.
- KV writes are a few dozen a day, inside the free plan ([ADR 0002](0002-stay-on-the-cloudflare-free-plan.md)).
- Freshness is bounded by the six-hourly schedule. A failed fetch alerts only once the copy is
  past its max age.
- A scraper (APOD) breaks when the page is redesigned; the refresh's `refresh:apod` failure is
  the signal.
- Revisit a source when its upstream answers Workers again and offers a usable API.

## Addendum, 2026-11-12: CelesTrak has no live tier

`/api/iss-tle` and `/api/satellites` no longer try live CelesTrak between fresh and stale KV
(#214). CelesTrak still blocks Workers egress, so the request could only fail, and its usage
policy says to stop querying on any non-200; a live try on every cache miss broke that. Their
order is now fresh KV, then stale KV marked degraded, then the hardcoded fallback. The refresh
job is the only CelesTrak caller (#212). `/api/launches` keeps its live RocketLaunch.live tier.

## Evidence

- #30, #72; commits b23b449, abef6c4.
- `functions/api/iss-tle.ts`, `functions/api/launches.ts`, `functions/api/apod.ts`,
  `scripts/refresh-data.mjs`.
- [reference/data-feeds-and-monitoring.md](../reference/data-feeds-and-monitoring.md#upstream-quirks).
