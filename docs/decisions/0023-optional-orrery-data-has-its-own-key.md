# 0023. Optional orrery data gets its own key, so only the visitors who ask for it pay

Status: Accepted · Date: 2026-11-12

## Context

The dwarf planets (#99 item 8) are about 131 KB of Horizons spans (59 KB gzip). The owner
decided they sit behind a "Dwarf planets" switch, off at first, loaded only when the switch or a
link asks, and never in `/api/orrery-bodies`, which every orrery visit loads.

The first build put them in a `dwarfs` array of `/api/orrery-smallbodies`, which was already
lazy on the orrery. But the Sky view's Tonight panel loads that same payload once a visitor
shares a location, and refetches it every 30 minutes. Measured on 2026-11-12, every Tonight
visitor would have downloaded 129.7 KB gzip instead of 71.9 KB, for data the panel never shows.
The owner's intent behind "lazy" was that only people who switch the dwarf planets on pay for
them.

## Decision

The dwarf planets have their own KV key (`horizons:dwarfs:v1`), written by their own step in
the refresh job, and their own endpoint (`/api/orrery-dwarfs`), streamed from KV like the other
orrery bodies. The client fetches it only when the switch or a dwarf-planet link asks. Chosen
over `/api/orrery-smallbodies?part=dwarfs`: a distinct URL keeps the edge cache, the health
check and the content contract one-to-one with one key, and the comets' Function stays as it
was.

Generally: data that only some visitors ask for does not ride in a payload that other
visitors load.

## Consequences

- The comets' payload is back to its size before the dwarf planets (164 KB, 72 KB gzip).
- One more Function, KV key, health contract (`orrery-dwarfs`, not a headline source: no view
  always fetches it, ADR 0018) and health-check probe. One more KV write per refresh run.
- A visitor who wants both comets and dwarf planets makes two requests instead of one.
- Revisit if the Tonight panel ever shows dwarf planets, or if a single payload becomes cheaper
  than two for the visitors who load both.

## Evidence

- #99; `functions/api/orrery-dwarfs.ts`, `scripts/orrery-dwarfs.mjs`,
  `src/hooks/useOrreryDwarfs.ts`, `src/components/orrery/useSmallBodies.ts`.
- Measurements and the e2e test that the Tonight panel never asks for them:
  `docs/reference/orrery-data.md` ("Dwarf planets"), `tests/e2e/orrery-dwarfs.spec.ts`.
