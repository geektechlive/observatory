# 0001. No CI and no PRs: `pnpm verify` is the gate

Status: Accepted · Date: 2026-10-09

## Context

Observatory is a personal site. Its GitHub Actions CI only re-ran the checks a developer already
runs locally. It was red on every branch, `main` included, from 2026-06-20 until 2026-09-09
(`pnpm/action-setup` with no `packageManager`), and nothing noticed for 11 weeks. Required status
checks were added in September and had gone again by October (#29). Pull requests were a wrapper
around a merge, because the owner doesn't review them, and Dependabot's version PRs filled their
cap with single bumps and hid majors behind them.

## Decision

The owner removed CI, required checks, PRs and Dependabot version-update PRs (#33). One local
command, `pnpm verify`, runs every check: lint, typecheck, unit tests with coverage thresholds,
build with bundle budgets, e2e, and `pnpm audit --audit-level=high`. Work lands by rebasing onto
`origin/main`, re-running the gate, and squash-merging to `main` with `Closes #N`. Dependabot
security alerts stay on, and `data-refresh.yml` stays because it is production operations, not CI.

## Consequences

- No dead pipeline can sit unnoticed, because nothing depends on one.
- There is no pause before production: a push to `main` deploys. The counter-case was raised and
  accepted because rollback is cheap (`git revert`, or the previous Pages deployment).
- Dropping a check from `verify` drops it entirely, so `tests/unit/ci-contract.test.ts` pins the
  list.
- A PR is still used when the owner wants to review something before it goes live; a pushed
  branch gets a preview URL.
- Revisit if the site gains other contributors or anything whose failure isn't cheap to roll
  back.

## Evidence

- #33, #29; commit 8a19566.
- `package.json` (`verify`), `tests/unit/ci-contract.test.ts`.
- [operations/landing.md](../operations/landing.md),
  [reference/dependencies.md](../reference/dependencies.md#history).
