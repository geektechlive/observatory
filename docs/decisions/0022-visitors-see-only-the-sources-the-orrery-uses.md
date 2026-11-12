# 0022. Visitors see only the sources the orrery uses; the full registry lives in docs

Status: Accepted · Date: 2026-11-11

## Context

The orrery's Data sources list rendered the whole provider registry from the orrery spec (#91):
22 entries, each with a raw status word ("registered", "unavailable"), and notes written for us.
Two notes quoted HTTP codes (501, 404), several cited issue numbers, and ten entries were
providers the site never calls, one of which does not exist. Visitors read the codes as broken
data, though the production feeds were working (#207). The registry also shipped in the
orrery's chunk.

## Decision

The visitor list shows only the providers the orrery itself fetches, checked against the code:
the name linked to its documentation, one plain sentence on what it gives the orrery, and the
credit its terms require where they are known to require one (Space-Track.org, ADR 0013; ESA's
licence reply is pending and the JPL, CelesTrak and DSN terms are unchecked). No
status, no HTTP codes, no issue numbers. The full registry, with every entry's status, terms,
limits and notes, is a table in
[reference/orrery-data.md](../reference/orrery-data.md#provider-registry-91-207), and the client
keeps only what the list needs. The owner asked for the change in #207.

## Consequences

- The list reads as a credit roll, not a status board, and the guide's data section links to the
  same addresses (a unit test keeps the two in step).
- A provider the orrery starts using is added deliberately: the test pins the exact list.
- Sources other views use (NeoWs, Sentry, Fireball and the rest) are not in this list; a site-wide
  credits list is a separate question.
- Revisit if the owner wants a planned or status view for visitors again.

## Evidence

- #207 and its source review comment.
- `src/lib/orrery/sources.ts`, `tests/unit/orrery-sources.test.ts`,
  `tests/unit/orrery-guide-sections.test.ts`.
- [reference/orrery-data.md](../reference/orrery-data.md#provider-registry-91-207).
