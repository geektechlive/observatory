# 0004. Health is judged by content contracts, and alerts are one GitHub issue per source

Status: Accepted · Date: recorded 2026-11-08, decided earlier (contracts 2026-09-07, issues 2026-10-09, 4-run threshold 2026-10-25)

## Context

On 2026-09-07 the site said LIVE while the ISS tracker, satellites, Kp, solar wind and Bz were
all blank. NOAA had changed a feed's shape and removed two others, and a failed parse returned an
empty payload with HTTP 200. Later, the health check's retries never reached the upstream (they
replayed a 60 s negative cache, #21), Discord was paged for single slow requests, and NASA
outages that nobody here could fix opened incidents for days (#65 collected 79 identical
comments).

## Decision

- Every source has a content contract (`src/lib/health.ts`): what its payload must contain and how
  old it may be. HTTP 200 is not evidence of working data.
- Retry infrastructure, never contracts: status 0, 5xx and 429 are retried past the cache window;
  a contract failure fails at once. Handlers say why they failed with `X-Error-Kind`
  (`contract` or `upstream`).
- Alerts are GitHub issues, one per source, opened on failure, auto-closed on recovery, reopened on
  recurrence, with Discord pings only on open, reopen and close (the owner's choice, 2026-10-09).
- The owner chose (2026-10-25, #71) that an upstream-caused failure opens only on its fourth run
  in a row (about 18-24 h). Drift and our own errors still open on the first run.
- The health job stays green when endpoints fail, and an open issue gets a comment only when its
  line changes or once a day (#120).

## Consequences

- Shape drift reads as an error within one run; upstream outages stay quiet for a day.
- Every handler that answers degraded must set `X-Error-Kind`, or its outages page at once.
- An outage is a day late to alert. That delay was the owner's explicit trade.
- Revisit the threshold if a real outage of ours is ever masked by it.

## Evidence

- #21, #61, #65, #71, #120; commits cb121d1, e568124, abef6c4, 14585a4.
- `src/lib/health.ts`, `scripts/check-health.mjs`, `scripts/report-incidents.mjs`.
- [reference/data-feeds-and-monitoring.md](../reference/data-feeds-and-monitoring.md).
