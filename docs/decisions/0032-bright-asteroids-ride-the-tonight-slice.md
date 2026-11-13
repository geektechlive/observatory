# 0032. The bright asteroids ride the Tonight slice (v2), and use nautical dark

Status: Accepted · Date: 2026-11-12

## Context

#99 item 4 adds bright asteroids to the Tonight list and to the orrery behind a "Bright
asteroids" switch (off at first). The design suggested putting them through the comets' refresh
step with "no new endpoint or KV key". Owner decisions of 2026-11-12: forecast V 11 or
brighter, at most 10 listed; darkness for asteroids is nautical (Sun below -12°); no
near-Earth flybys in this version; no accuracy figure on the brightness.

Two things in the code differ from the design's picture. Putting ~14 asteroids' ±30 days into
`horizons:smallbodies:v1` would add to the 72 KB gzip body every Comets-switch visitor loads, the
pattern ADR 0023 exists to stop. And at -18° a London midsummer night has no astronomical dark,
so one dark window for the whole list would drop the asteroids that decision 2 wants kept.

## Decision

- **Where the job puts them.** `buildOrrerySmallBodies` fetches the asteroids last in its one
  JPL queue (one SBDB query `sb-kind=a`, `H<8`, `a<5.5`; one Horizons request each, daily ±30
  days with velocities, target name asserted), so the step budget cuts asteroids, never comets
  or 1I-3I. It returns them beside the payload, not in it. `buildCometsTonight` slices them to
  the same window and the Tonight key moves to `horizons:comets-tonight:v2`. Both the Tonight
  panel and the orrery's switch read that slice; the comet body is unchanged.
- **Ranking.** The IAU H,G law (`asteroidMagnitude`, checked against Horizons' APmag for Vesta),
  G = 0.15 where SBDB has none (flagged `gAssumed`). The job keeps V 11.5 or brighter on the
  refresh day, at most 14; the panel applies V 11 at the time of best view and lists at most 10.
- **Ceres** is fetched like the others and listed in Tonight; the orrery leaves it out of the
  asteroid group, since the dwarf planets draw it from their own data under the same `sbc:` key.
- **Darkness.** Comets keep -18°; asteroids use -12° (`darkWindow` takes the altitude).
  The two windows are separate, so a night with no astronomical dark still lists asteroids.
- **Reach limits** for an asteroid are star limits (6.5 eye, 10 binoculars, 13 small telescope);
  the comets' brighter limits do not apply to a point of light.

- **A run that loses its asteroids keeps yesterday's.** If a run places none (budget cut before
  the query, an SBDB outage, every Horizons request failing), `refreshOrrerySmallBodies` reads the
  previous `comets-tonight:v2` and carries its asteroids forward (`carryForwardAsteroids`) while
  their samples still cover the next two days; it reports that as a warning in the step's detail.
  With no usable previous slice it writes the empty list, and the `comets-tonight` contract then
  fails: a real outage, not one an old copy can cover. Without this, one bad asteroid step
  would overwrite a good list with `[]` and degrade the whole Tonight feed though the comets
  were fine.
- **Colour.** The asteroid group is the thermal lane's orange: the first pick, the geophysical
  gold, sat too close to the close approaches' amber (`STATUS_HEX.watch`).

## Consequences

- One more refresh-step cost: 15 JPL requests, about 22 s measured (the step ran 22 s before).
  The step budget is 90 s (`DEFAULT_BUDGET_MS`) against about 45 s measured with the interstellar
  spans reused (49 s cold), so the margin is about 40 s; asteroids are last, so the budget cuts
  them first.
  Same KV key family: still two KV writes a run (the key moved, no key was added).
- The Tonight slice grows from about 5 KB to about 11 KB gzip.
- Orrery asteroid markers are visible only within the slice's week (-1 to +7 days of the
  refresh); outside it they are hidden, never extrapolated.
- The health contract `comets-tonight` also requires a non-empty `asteroids` list; a refresh
  whose asteroid step broke is flagged although HTTP 200 and the comets are fine (ADR 0004).
- Between the push and the first refresh run, `/api/comets-tonight` answers the "not yet in KV"
  503; run the refresh workflow once after landing.
- Revisit if near-Earth flybys are wanted (they need the close-approach data's dense spans) or
  if the asteroid list should be longer than the 10 the owner chose.

## Evidence

- #99; `scripts/orrery-smallbodies.mjs` (`buildAsteroids`), `scripts/comets-tonight.mjs`,
  `src/lib/orrery/smallBodies.ts`, `src/lib/sky/asteroidsTonight.ts`, `src/lib/tonight.ts`.
- Tests: `tests/unit/orrery-bright-asteroids.test.ts` (law vs Horizons),
  `tests/unit/scripts/orrery-smallbodies.test.ts` ("the bright asteroids"),
  `tests/unit/sky-asteroids-tonight.test.ts`, `tests/unit/tonight.test.ts` (nautical window).
- Measurements: `docs/reference/orrery-data.md` ("Bright asteroids").
