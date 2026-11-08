# 0018. The header's status judges the view on screen, by that view's own feeds

Status: Accepted · Date: 2026-11-08

Amends [ADR 0004](0004-content-contracts-and-issue-per-source-alerts.md): the content contracts
stand; what the header's LIVE / DEGRADED / SYNCING pill judges changes.

## Context

Since 2026-09-07 (cb121d1) the pill judged seven "headline" sources: eonet, geomag, iss-tle,
launches, neo, quakes and solar wind. It read SYNCING until every one had reported. The rule
behind the list was that a headline source's hook always mounts (satellites was left out because
its layer starts off). The dial later split the page into views, and no view mounts all seven:
`useNeo` lives only on Sky and `useGeomag` only on Sun. Measured on production on 2026-11-08,
a cold load of each of the five views fetched between one and six of the seven, and every one
read SYNCING indefinitely (#178). The pill said nothing, so a broken site looked like a loading
one.

Three ways out were weighed:

- Ignore any source the page never asked for. Simple, but a hook that silently stopped mounting
  would drop out of the judgement unseen, which is the failure the contracts exist to prevent.
- Fetch all seven on every view. It undoes the orrery's lean first load (#167) and costs
  visitors feeds they don't see.
- Give each view its own list.

## Decision

Each view is judged by an explicit list of the headline sources it shows and always fetches
(`VIEW_HEADLINES` in `src/lib/health.ts`): Earth by EONET, quakes, the ISS TLE and solar wind;
the orrery by its bodies and close approaches; Sun by solar wind and geomag; Sky by NeoWs; Orbit
by the ISS TLE and launches. The pill reads SYNCING until all of the current view's sources have
reported, LIVE when all pass their contracts, DEGRADED otherwise. Failures in sources the view
doesn't show don't count against it. An e2e test checks that a cold load of each view really
asks for every source on its list.

## Consequences

- The pill settles on every view, so it means something again.
- A source that stops being fetched by its view fails the e2e test instead of quietly leaving
  the judgement.
- The pill no longer reports on the whole site: a Sky visitor isn't told the quake feed is down.
  Site-wide outages are what the scheduled health check and incident issues are for (ADR 0004).
- Adding a view, or moving a headline feed between views, means updating `VIEW_HEADLINES`; a new
  view that isn't listed fails the typecheck.
- Revisit if the header is ever meant to summarise the whole site again; that would need every
  view to fetch every listed feed.

## Evidence

- #178 (the per-view measurement is in its comments); cb121d1.
- `src/lib/health.ts` (`VIEW_HEADLINES`, `deriveLiveStatus`),
  `src/components/status-bar/HeaderPlate.tsx`, `tests/unit/health.test.ts`,
  `tests/e2e/view-headlines.spec.ts`.
