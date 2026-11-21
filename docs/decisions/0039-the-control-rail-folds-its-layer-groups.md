# 0039. The control rail folds its layer groups, and each hint is one line

Status: Accepted · Date: 2026-11-20

## Context

The orrery's control rail had grown to about 2,680 px in a 720 px desktop window (about
3.7 screens) and about 2,560 px in the phone sheet. Most of that was layer groups that are off
by default, each switch with a full visible hint (#122: phones have no hover, so no tooltips).
#263 moved Find and View to the top, but the long tail stayed.

The senior-designer agent rendered three directions against a rebuild of today's rail, within
1.6% of production: A folding groups, B one switchboard with a tap-to-read ⓘ per switch, and
C tabs. With the mockup's three merges, A measured 994 px by default and 660 px with every
group folded (the Guide merge, not taken, was about 54 px of that); B saved the least (1,746 px) and hid the hints behind a tap, undoing #122; C didn't
fit 720 px and showed one group at a time.

## Decision

The owner chose A (2026-11-20), with two merges (2026-11-18):

- Learn, Find and View never fold. Every other group's heading is a button that folds it and
  shows what is on ("3 of 3 on", "Off", "40 drawn"). Solar system and Spacecraft start open.
- A visitor's folds are remembered in localStorage (`observatory.orrery.rail.v1`), not a
  cookie, which would ride every `/api` request. A group that opens by itself is not
  remembered.
- When something outside the rail switches a layer on (Find, a link, Show me, a preset), its
  group opens, marks the row and says what was switched on, without moving focus.
- Each switch keeps a visible hint, as #122 requires, but cut to one line. The detail cut from
  the hints moves to the guide's "The controls" section, and the satellite browser keeps the
  full satellite hints.
- Dwarf planets joins comets, bright asteroids and interstellar objects as **Small bodies**.
  The Sun–Earth line joins the close approaches as **Near Earth**.
- Group headings stay slanted, as they render today; the owner declined making them upright.

The mockup's third merge, the Guide button moving into the Find header, was not part of the
owner's answer, so Learn stays a group of its own.

## Consequences

- The rail starts at about a third of its old height and reads as a table of contents.
- What a switch covers in detail is one tap further away (the guide), not on the switch.
- The mark and note last 8 s from when the group is first on screen, so a phone visitor
  whose sheet closed still sees them on opening it. The note sits in a status region that is
  always present, so screen readers announce it.
- Near Earth's readout counts the approaches drawn ("40 drawn"), so a folded group doesn't
  show whether the Sun–Earth line is on. Only that line opens the group by itself: the close
  approaches have no switch.
- Tests that use a switch in a folded group open the group first (`tests/e2e/railFolds.ts`,
  `tests/unit/fixtures/openFolds.ts`).
- Revisit if visitors miss layers because their groups are folded, or if the site-wide
  redesign (#274) replaces the rail.

## Evidence

- #273, #263, #122, #274.
- `src/components/orrery/FoldGroup.tsx`, `railFolds.ts`, `ControlRail.tsx`,
  `SmallBodyControls.tsx`, `NeoControls.tsx`, `SatControls.tsx`.
- Mockups and measurements: `docs/design-history/rail-2026-11/` (`measure.json`, contact sheets).
- `tests/e2e/orrery-rail-folds.spec.ts`, `tests/unit/orrery-fold-group.test.tsx`,
  `tests/unit/orrery-rail-folds.test.ts`.
