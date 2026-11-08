# 0014. The orrery's guide teaches by doing, through the same links a visitor can share

Status: Accepted · Date: 2026-11-08

## Context

The orrery carries a lot (presets, the Earth frame, close approaches, satellites, JPL lookups),
and newcomers had no way in. A tour that drives the UI with its own code would duplicate the
link-handling path and drift from it.

## Decision

The guide (#159) is a lazy drawer of lessons, a glossary and "what's this?" terms in the
inspector. Each lesson's "Show me" is a shareable orrery link, applied through the same path the
address takes on load (`applyLink(link, { fresh: true })`). A lesson carries a fixed time only
where its data lasts (Voyager 1 at the heliopause, Mars at opposition, 'Oumuamua at perihelion);
lessons on data that exists only near today carry none. Every glossary entry names its source,
and the quoted arithmetic is tested. A first-visit chip is a note, never a modal.

## Consequences

- Lessons can't drift from what links do, and every lesson is a URL that can be shared.
- The guide costs the first load and the orrery page nothing until it is opened (its own chunk,
  with bundle rules).
- When a control the guide explains changes, its section in `guide/sections.ts` changes in the
  same commit.
- Revisit if lessons need steps a link can't express.

## Evidence

- #159, #108; commit 92f840b.
- `src/components/orrery/guide/`, `src/lib/orrery/glossary.ts`,
  `tests/unit/orrery-guide-facts.test.ts`.
- [reference/orrery.md](../reference/orrery.md#the-guide-159).
