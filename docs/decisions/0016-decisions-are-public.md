# 0016. This repository's ADRs are public

Status: Accepted · Date: 2026-11-08

## Context

The owner's other public repositories keep their ADRs private, in a gitignored folder. Observatory
is public, and its reasoning was already public in `CLAUDE.md` and the issues. The owner first
chose a private folder for these ADRs, then reversed it the same day.

## Decision

Observatory's ADRs are tracked in `docs/decisions/`, public. No ADR may hold secrets, tokens,
account or zone IDs, email addresses or personal details. People are named by role ("the
owner"), and evidence is limited to what a reader of the repository can open: issues, commits,
tracked files and public URLs. The rule is written into the template.

## Consequences

- ADRs can link to and from issues, the README and the reference docs.
- Anything sensitive behind a decision stays out of the ADR; the ADR states the decision and its
  public evidence.
- Revisit if a decision ever can't be explained without private detail; record that one
  elsewhere and leave a public stub.

## Evidence

- #170.
- [0000-template.md](0000-template.md) (the content rule).
