# 0035. Close passes get ten-minute samples, found from the samples themselves

Status: Accepted · Date: 2026-11-14

## Context

Craft are sampled once a day (Parker twice) over ±30 days and drawn by cubic Hermite on
position and velocity (ADR 0009). That reproduces Horizons to within a few km on a cruising
arc. A planetary flyby or perijove lasts hours, and there the daily curve misses badly. Europa
Clipper's Earth flyby on 3 Dec 2026 drew about 660 km under Earth's surface, while Horizons
puts closest approach at 9,609 km from the centre. The inspector still called the position
"within a few km of its own samples", with high confidence (#230).

On the 2026-11-14 payload, rebuilding each daily sample from its two neighbours missed by
under 80 km for every cruising craft and the Moon. It missed by 83,000 km for Clipper (its
flyby), 404,000 km for Juno (a perijove), 330,000 km for Parker (a perihelion) and 88,000 km
for BepiColombo. BepiColombo's misses ran for weeks, because it begins circling Mercury every
few hours.

## Decision

The data itself finds close passes; no list of flybys is kept by hand. `encounters.ts` flags a
stretch whose double-step miss exceeds 1,000 km. For each flagged run of 10 days or less, the
refresh job asks Horizons for 3 days at 10 minutes around the run's worst sample. It does this
after every body and moon, best-effort, at most four a run, and ships them as the track's
`dense` spans. `stateAt` answers from a dense span first.

A longer run is treated as an orbiter and gets no dense span. Wherever only daily samples cover
a rough run, the inspector lowers confidence and says the path may be off by thousands of km.

## Consequences

- Flybys, perijoves and perihelia are drawn from Horizons at 10-minute steps without anyone
  tracking mission calendars. Clipper's flyby now passes 9,609 km from Earth's centre, within
  100 km in the test.
- Each pass costs one Horizons request per refresh (4 a run at most) and about 35 KB in the
  payload. A failed or out-of-budget pass leaves the daily samples and is logged, never
  counted as missing.
- The window is 3 days whatever the run's length. A longer rough run (Juno's perijove, Parker's
  perihelion) keeps its edges on daily samples, where the miss is smallest: the path can step
  slightly at the window's edge, and the inspector marks those edges medium confidence.
  Covering whole runs at 10 minutes would add about 200 KB to every orrery load, so that was
  declined. Overlapping windows from one pass are asked for once, and a failed ask keeps the
  previous run's span over the same pass, so a flyby doesn't flip back to daily samples.
- An orbiter circling its planet in hours (BepiColombo) still draws from daily samples, and
  says so. Revisit if the orrery gains a close-up frame for a planet other than Earth, where
  that error would show.
- Revisit the 1,000 km threshold if a cruising craft's double-step miss approaches it.

## Evidence

- #230; `src/lib/orrery/encounters.ts` (`ROUGH_MISS_KM`, `ENCOUNTER_MAX_RUN_DAYS`).
- `scripts/orrery-bodies.mjs` (`addClosePasses`); `src/lib/orrery/ephemeris.ts` (`stateAt`);
  `src/lib/orrery/craftState.ts` (`accuracyText`).
- `tests/unit/orrery-flyby.test.ts` with the fixtures `clipper-flyby-10m.txt` (Horizons,
  recorded 2026-11-14) and `clipper-flyby-daily.json`.
- `docs/reference/orrery-data.md`, "Close passes get 10-minute samples".
