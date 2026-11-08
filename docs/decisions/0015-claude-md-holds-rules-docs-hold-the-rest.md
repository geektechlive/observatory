# 0015. CLAUDE.md holds rules and pointers; history and measurements live in docs/

Status: Accepted · Date: 2026-11-08

## Context

`CLAUDE.md` had grown to about 95 KB (about 22K tokens) because every feature added its history
and measurements there. It is read on every turn of an AI coding session and by every agent that
session starts, so its size is a cost paid constantly, and its decisions had no stable home to
link to. Another of the owner's projects uses a 13.7 KB `CLAUDE.md` that opens with pointers, plus
`docs/decisions/` and `docs/operations/`.

## Decision

The owner decided (#170) that documentation lives in `docs/`, decisions are recorded as ADRs in
`docs/decisions/` and are the source of truth, and `CLAUDE.md` keeps only the stack, commands,
hard rules, one-line gotchas, the workflow and pointers. Reference material by area goes in
`docs/reference/`, runbooks in `docs/operations/`, the phase record in `docs/history.md`.
`tests/unit/claude-md-size.test.ts` fails when `CLAUDE.md` passes 20 KB.

## Consequences

- Each session carries a fraction of the old context, and decisions can be linked from issues and
  the README.
- A new feature's history and numbers go in its reference doc; `CLAUDE.md` gains at most a
  one-line rule or pointer. A decision gets an ADR in the same change.
- Code comments point at docs, not at `CLAUDE.md` sections.
- Revisit the 20 KB limit only by raising it in the test, with a reason in the commit.

## Evidence

- #170.
- `CLAUDE.md`, `docs/README.md`, `tests/unit/claude-md-size.test.ts`.
