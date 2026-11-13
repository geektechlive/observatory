# 0031. The elements of re-entry objects come from Space-Track, stored in the catalogue body

Status: Accepted · Date: 2026-11-12

## Context

Space-Track's TIP messages (#101) say which objects will re-enter, but carry no orbit. The orrery
had elements only for the groups a visitor switched on, so a prediction for a Starlink (Starlink
starts off) drew no ring: on 2026-11-07 all five predictions were Starlinks and the feature looked
empty (#154). Drawing one would have meant a 477 kB Starlink download, and the Worker cannot filter
a 1.7 MB body to a few rows inside its 10 ms (ADR 0002). Two sources were possible: Space-Track's
GP class for the listed ids (one more request per run), or rows derived from the CelesTrak groups
the same run already holds (no request, but it couples two steps and misses an object CelesTrak no
longer carries).

## Decision

The owner decided (2026-11-12) on Space-Track, credited "Space-Track.org". Right after TIP, in the
same session, the refresh job sends one GP list query for the listed NORAD ids and stores the
compact rows as `tip.elements` inside `spacetrack:catalog:v1`: no new key, no extra write. The
client reads them as `unknown` in the first load and checks them in the orrery chunk; the worker
loads them as an extra group (`reentry`) whatever the switches say, de-duplicated against the loaded
groups, which win.

## Consequences

- One more Space-Track request per run (four a day), far inside 30 a minute and 300 an hour. It is
  one list query, not the hundreds of single-object queries the guidelines rule out.
- A failed GP query keeps the earlier rows of objects still listed and reports `tip-elements` as
  missing; it never costs the TIP list.
- The first-load schema gains one optional `unknown` field (`entry-gzip` 152.8 to 152.9 kB).
- Revisit if Space-Track's GP answer for decaying objects proves stale (the 3-day epoch window would
  hide them), or if its guidelines change the list-query allowance.

## Evidence

- Issue #154 and its design note and owner decision.
- `gpListUrl` in `src/lib/spacetrack.ts`; the `tip-elements` step in `scripts/spacetrack.mjs`.
- `reentryElementRows` in `src/lib/orrery/reentryElements.ts`; `REENTRY_GROUP` in
  `src/lib/orbit/satCatalog.ts`; `rebuild` in `src/lib/orbit/bulk/satHandler.ts`.
- `docs/reference/satellites.md`, "Re-entry objects outside the switched-on groups".
