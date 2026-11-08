# 0008. The orrery is a whole page with its own dial tab, not a lens

Status: Accepted · Date: 2026-11-06

## Context

The owner asked for an orrery on 2026-11-06, guided by a specification document the owner
compiled. The other views (Earth, Sun, Sky, Orbit) share one layout: a lens beside a console
column. A solar system with time controls, search, an inspector, spacecraft and satellites needs
more room than a lens and a different control set.

## Decision

The owner chose a full-page 3D orrery with its own dial tab (earth, orrery, sun, sky, orbit). When
`view === 'orrery'` the page renders a lazy `OrreryPage` instead of the lens and console columns;
the ticker and footer step aside. Its renderer has its own WebGL context for the page's lifetime.
The owner also asked to "lean into the doc": every gap against the spec is explained, not quietly
dropped.

## Consequences

- The orrery's code (three.js scene, data, controls) stays out of the first load; bundle rules
  enforce it (`entry-has-no-orrery`).
- Shared parts take a view type (`ConsoleColumnView`) that excludes the orrery, and the orrery
  writes its own voice line.
- A direct `#orrery` load must not mount the Earth page first (#167).
- Revisit only if the orrery is ever folded back into the shared layout.

## Evidence

- #91, #167; commit d7b563c.
- `src/components/orrery/OrreryPage.tsx`, `src/App.tsx`.
- [reference/orrery.md](../reference/orrery.md).
