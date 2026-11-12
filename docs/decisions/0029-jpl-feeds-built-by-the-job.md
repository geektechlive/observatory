# 0029. Planets, Sentry and fireball are built by the refresh job; visitors never call JPL

Status: Accepted · Date: 2026-11-12

## Context

JPL's Fair Use asks for one request at a time from us, and Horizons answers 503 to overlapping
ones (#88). The orrery's data already comes from the refresh job ([ADR 0009](0009-horizons-sampled-in-the-refresh-job.md))
and arbitrary lookups go through one Durable Object ([ADR 0010](0010-on-demand-jpl-through-one-durable-object.md)).
`/api/planets`, `/api/sentry` and `/api/fireball` were the last Functions that called JPL
themselves, on a cache miss, so two visitors (or a visitor and a lookup) could still overlap.

Routing them through the queue (#146, branch `p3-infra`, never landed) worked but had costs. The
queue's 2,000-requests-a-day cap is shared with visitor lookups, and about eight busy data
centres' cache misses would use it up. The Sky view would wait about 9 s instead of about 1.3 s
for the first visitor after UTC midnight (planets are keyed by date). A busy queue also meant
more partial planet answers, cached for an hour.

## Decision

The owner chose, on 2026-11-12, to move the three feeds into the refresh job, KV-first like the
orrery data. `scripts/jpl-feeds.mjs` asks JPL one request at a time (Sentry, fireball, then the nine
Horizons bodies), after the dwarf-planet step and inside the job's single deadline. Each
feed is a finished body in its own KV key with its age in the metadata: `horizons:planets:v1`,
`jpl:sentry:v1`, `jpl:fireball:v1`. The Functions pass the body through unparsed
(`_kvBody.ts`) behind the Cache API and have no live JPL fallback: until the job has written a
key, the answer is our JSON 503 ("not yet in KV"), never a 502 or 504.

## Consequences

- No visitor request reaches JPL for these feeds, and they no longer share the queue's cap.
- The three feeds are reported and judged separately (`refresh:planets`, `refresh:sentry`,
  `refresh:fireball`), each by the age of its own KV copy: 24 h, 48 h and 48 h. They share one
  60 s budget, so the planets go last: a slow Horizons outage (each body burning its retries) can
  use the budget up on them, and then costs only the planets.
- Planets are for the UTC date of the last run, so after 00:00 UTC until the 00:17 run (longer
  if that run is late or fails; GitHub schedules can be delayed) they show yesterday's positions. Before, the first visitor of the day
  fetched fresh ones.
- A partial planets build (a body failed) does not replace a fuller copy that is under 24 h old;
  the job keeps that copy and warns. No old body is carried into a new copy, or the Moon would go stale.
- A deploy of the Functions before the first refresh run shows 503s for these three panels; see
  [data-feeds-and-monitoring.md](../reference/data-feeds-and-monitoring.md).
- Three more KV writes a run, 12 a day, on top of about 96 ([ADR 0002](0002-stay-on-the-cloudflare-free-plan.md)).
- Revisit if the panels need a position that is newer than the last run.

## Evidence

- #146; the queue attempt is commit 16260c2 on branch `p3-infra`, kept only for reference.
- `scripts/jpl-feeds.mjs`, `refreshJplFeeds` in `scripts/refresh-data.mjs`,
  `functions/api/planets.ts`, `sentry.ts`, `fireball.ts`, `functions/api/_kvBody.ts`.
- [reference/data-feeds-and-monitoring.md](../reference/data-feeds-and-monitoring.md).
