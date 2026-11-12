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

## Addendum, 2026-11-12 (#223): trajectories get their own capped share

The owner decided the next step is taken now: the 2,000 a day is split into two shares, each its
own counter in the Durable Object's storage, one row per UTC day. **Trajectories: 600. Lookups:
1,400.** They add up to the same 2,000, and a share can spend only its own part, so a script that
empties the trajectory share cannot touch the 1,400 lookups rely on.

- **Who decides the share:** the Pages Function, in a `share` field of the body it posts to the
  queue (`/api/lookup` sends `lookup`; `/api/trajectory` sends `trajectory` for both its Horizons
  request and the SBDB read it makes first, because an open-ended SPK-ID would otherwise be a way
  to spend lookups). The binding is reachable only from the Functions, so a visitor never picks.
  A body with no `share` counts as a lookup (the Functions deployed before this change send none);
  an unknown `share` is a 400. Either can be deployed first: the old Worker ignores `share`, so
  until the Worker is deployed everything counts against the one old 2,000. Lookups keep the old
  storage key, so on the deploy day they resume from that day's combined count.
- **A spent share** answers as a spent day always has: 503 with `Retry-After` until UTC midnight,
  `X-Queue: budget` and now `X-Queue-Share`. The Function turns it into `upstreamError` (503,
  `X-Upstream-Status`, `X-Error-Kind: upstream`), never 502 or 504, and the 60 s negative cache
  stops the same request asking again. Nothing is retried but infrastructure errors.
- **Why 600.** What a normal day needs is estimated, not measured (no per-object traffic data
  exists; the site is small). One object opened with "Show in orrery" costs 1 SBDB read (cached a
  week) and 1 Horizons request for the 2-day span (cached a day), plus one dense span for each
  close pass opened. Scrubbing the date moves the span's centre on a 120-day grid, so each cell
  entered is one more request: ten years of scrubbing is about 30. A heavy session of 5 objects,
  one dense span each and 10 years of scrubbing is then about 5 x (1 + 1 + 1) + 5 x 5, roughly
  40 requests. 600 covers some 15 such sessions in a day with every cache cold. (The Cache API
  keeps entries per data centre, so the same span can miss once in each; that is why the figure
  leaves room rather than being the bare estimate.)
  At the queue's one request a second, 600 is also ten minutes of JPL's time, which bounds what one
  script can take from JPL. Lookups keep 1,400, far above what free-text searches need (each is
  cached a day per spelling).
- **Cost:** lookups are held to 1,400 where they had 2,000, and the unused part of either share is
  not lent to the other. Both would need a day of traffic far beyond the site's to matter.
- **Revisit** if either share is reached on a day without a script behind it (the queue's 503
  carries `X-Queue-Share` to say which; the public `/api/` answer does not pass it on), and move 100 or 200 across rather than lifting the total:
  the 2,000 is Fair Use pacing, not a plan limit.

## Evidence

- #100, #145, #223; commit d64212a.
- Shares: `workers/jpl-queue/src/budget.ts` (`TRAJECTORY_DAILY_LIMIT`), `handler.ts`,
  `functions/api/_jpl.ts` (`askJpl`'s `share`).
- `workers/jpl-queue/`, `wrangler.toml` (`JPL_QUEUE`).
- [reference/orrery-data.md](../reference/orrery-data.md#on-demand-jpl-100).
