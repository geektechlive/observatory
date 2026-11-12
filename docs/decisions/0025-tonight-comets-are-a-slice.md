# 0025. The Tonight panel's comets are a slice the refresh job cuts, under a key of their own

Status: Accepted · Date: 2026-11-12

## Context

The Sky view's Tonight panel lists the comets up in the dark (#99). It read
`/api/orrery-smallbodies`, the orrery's comet payload: ±30 days of daily vectors for every comet
and interstellar object, 1I's and 2I's and 3I's long spans, elements and orbit solutions. Measured
on the production payload of 2026-11-12, that is 164,424 bytes (71,878 gzip), fetched once a
visitor shares a location and refetched every 30 minutes. The panel uses only the bodies with a
magnitude law and the samples around tonight (#135).

The Pages Function cannot cut the payload per request: Worker CPU is 10 ms, so KV bodies are
streamed through unparsed (`_kvBody.ts`, ADR 0002). KV is never written on a request path.

## Decision

The refresh job cuts the slice from the comet body it has just built, in the same step
(`scripts/comets-tonight.mjs`), and writes it under its own key, `horizons:comets-tonight:v1`,
served by `/api/comets-tonight` like the other KV bodies. The slice keeps every body with a
magnitude law, and each one's spans from a day before the refresh to a week after: the copy is
fresh for 72 h and tonight's dark window ends at most about a day and a half ahead, so a copy
served stale for a few days still answers. Nothing is rounded; a unit test checks that the panel
gives the same answers from the slice as from the full body.

This follows ADR 0023 (data some visitors don't need does not ride in what they load), from the
other side: here the smaller audience's payload is the derived one.

## Consequences

- A Tonight visitor downloads about 5 KB gzip of comets instead of 72 KB.
- One more KV write per refresh run (four a day against the free plan's 1,000). The issue hoped
  for none; that needs the Function to parse the body, which the CPU limit rules out.
- One more Function, health contract (`comets-tonight`, not a headline source) and health-check
  probe.
- The slice is written only with the body it was cut from, so the two never disagree; if the step
  fails, both age together.
- A visitor who opens both the orrery's comets and the Tonight panel downloads both payloads.
- Revisit if the panel needs more than a week ahead, or the slice's window and the 72 h freshness
  drift apart.

## Evidence

- #135; `scripts/comets-tonight.mjs`, `scripts/refresh-data.mjs` (`refreshOrrerySmallBodies`),
  `functions/api/comets-tonight.ts`, `src/hooks/useCometsTonight.ts`.
- Tests: `tests/unit/scripts/comets-tonight.test.ts` (same answers, size),
  `tests/e2e/orrery-dwarfs.spec.ts` (the panel never asks for `/api/orrery-smallbodies`).
- Measurements: `docs/reference/orrery-data.md` ("Comets tonight").
