# 0010. On-demand JPL lookups go through one Durable Object queue

Status: Accepted · Date: 2026-11-07

## Context

Visitors should be able to find any small body, not only the ones the refresh job samples. JPL's
fair use asks for "only one API request at a time", and Horizons answers 503 to overlapping
requests. Pages Functions run in many isolates and can't serialise requests between themselves.
Pages can't host a Durable Object; a Pages binding needs a separate Worker (`script_name`).
SQLite-backed Durable Objects are on the Workers Free plan.

## Decision

With the owner's approval of a new free Worker, every visitor lookup reaches JPL through one
Durable Object, `JplQueue`, in its own Worker (`observatory-jpl-queue`): one instance, an explicit
promise chain, 1 s between starts, at most 8 waiting, 2,000 JPL requests a UTC day, JPL hosts
only, reachable only through the Pages binding. `/api/lookup` and `/api/trajectory` cache their
answers for a day with the Cache API.

## Consequences

- Search covers JPL's whole catalogue without breaking its fair-use terms.
- A busy queue answers 503 with `Retry-After`, and the client says so in words.
- The free-plan duration limit can't be exhausted by one instance awake all day (11,059 of 13,000
  GB-s).
- The cached Functions `/api/planets`, `/api/sentry` and `/api/fireball` still call JPL directly.
- Revisit if JPL publishes a rate limit that allows parallel requests, or the queue's daily
  budget is regularly reached.

## Addendum, 2026-11-12 (#223)

`/api/trajectory` answers 400 to any span the orrery does not ask for. It takes only a 2-day span
from `lookupSpan` and a dense 10-minute span from one of its interior samples; both are built and
checked in `src/lib/orrery/lookupSpan.ts`. A free choice of start, end and step let one script make
a new cache miss, and so a new request against the daily budget, every time. Per object the keys
drop from tens of millions to 37,667. It does not stop a determined script, because SPK-IDs and
`/api/lookup`'s search text stay open. A separate, smaller daily share for trajectories is the next
step if the budget is ever reached.

## Evidence

- #100, #145, #223; commit d64212a.
- `workers/jpl-queue/`, `wrangler.toml` (`JPL_QUEUE`).
- [reference/orrery-data.md](../reference/orrery-data.md#on-demand-jpl-100).
