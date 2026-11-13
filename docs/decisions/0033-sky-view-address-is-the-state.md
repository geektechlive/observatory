# 0033. The sky view's state is the address, and it draws only Horizons samples

Status: Accepted · Date: 2026-11-12

## Context

#99 item 5 adds a sky view for one selected object. The design (2026-11-12) said the target
comes from a Tonight row or an inspector link as `#sky?target=sb:…`, that the dome sits in
`SkyConsoleRest`, and that `passes.ts` is not reusable. Owner decisions of 2026-11-12: east on
the left and north up; a view opened from the orrery uses the orrery's clock, with a "now"
button; opened from Tonight it uses real time.

Checked against the code: in the orrery `sb:` is a close approach and comets, asteroids and
dwarf planets are `sbc:<SPK-ID>` (`smallBodyView.ts`); the Tonight slice's own ids are
`sb:<SPK-ID>`. `useHashView.buildHash` wrote a bare `#sky`, which would have erased any
parameter on load.

## Decision

- **The address is the state.** `#sky?target=sbc:<SPK-ID>[&t=<ISO UTC>]`. No store: the panel
  reads the hash (`useSkyLink`), and a Tonight row, the orrery's button or a pasted link all
  only write it. `useHashView` keeps `target` and `t` on the Sky console, as it keeps the
  orrery's params. This costs the first load 53 B gzip, the only first-load change.
- **The key is the orrery's `sbc:`**, not `sb:`. The slice id converts by prefix.
- **Time.** The orrery button writes the orrery clock's moment as `t`, or none when the clock
  runs at real time. The view is a fixed moment while `t` is present; "Now" removes `t` and
  leaves the orrery clock alone. A playing orrery clock is read at the press, not followed.
- **Where it came from.** The button writes `history.state = { skyFrom: 'orrery' }` beside the
  address, so the heading can say the time is the orrery's at the press; a pasted link has no
  such mark and is described as a plain moment. A mark in the address was the alternative; it
  would have added a param to the first-load `OWN_PARAMS`.
- **Data scope.** Only the Tonight slice (about 11 kB), not the 72 kB small-bodies payload.
  Objects or dates it does not cover are said so, never drawn (interpolate, never
  extrapolate).
- **Shared maths.** `lib/sky/track.ts` (no satellite.js) holds `collectRuns`, extracted from
  `passes.ts`, plus the dome projection, the night, the track and the twilight band.
  `skyRun` and `coveredWindow` moved there; the old import paths still export them.
- **Drawing.** North up, east left, one projection (`domePoint`). Labels are HTML in percent;
  the TickRing is a bezel only. The track uses the object's lane colour (asteroid thermal,
  comet space); the marker is bone.

## Consequences

- A shared sky link works with no state to restore, and Back/Forward move between sky views.
- Opened from the orrery, the view is a snapshot of the clock: scrubbing the orrery afterwards
  does not move it. Following the clock live was the alternative; it was not chosen
  because a pasted or reloaded link has no orrery clock to follow, so the moment has to travel
  in `t` to round-trip. A paused orrery clock behaves the same either way; a clock playing fast
  does not.
- Only Tonight-slice objects have a sky view (comets, interstellar objects with a magnitude
  law, the bright asteroids and Ceres). Planets and close approaches do not, and the inspector
  button appears on the small bodies only.
- Revisit if the sky view should cover planets (they have their own Planets panel), or if the
  slice's week proves too short for orrery dates.

## Evidence

- #99; `src/lib/sky/skyLink.ts`, `src/lib/sky/track.ts`, `src/components/panels/SkyViewPanel.tsx`,
  `src/components/orrery/skyViewLink.ts`, `src/hooks/useHashView.ts`.
- Tests: `tests/unit/sky-link.test.ts`, `sky-track.test.ts`, `sky-view-panel.test.tsx`,
  `orrery-sky-link.test.ts`, `orrery-sky-button.test.tsx`, `hash-view.test.ts`,
  `iss-passes.test.ts` (regression gate for the extracted loop).
- Measurements: `docs/reference/orrery-data.md` ("Sky view for one object").
