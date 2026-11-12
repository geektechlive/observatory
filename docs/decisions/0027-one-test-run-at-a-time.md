# 0027. One test run at a time on this machine, enforced by a lock with a cool-down

Status: Accepted · Date: 2026-11-12

## Context

Work runs in several worktrees at once, often with agents in each, and every worktree runs
its own test suites. Each worktree has its own e2e preview port (#111), so they never share a
server, but they do share the CPU. When suites overlap, e2e specs in unrelated areas time out
or race. On 2026-11-12 that happened four times, in map-credits, orrery-lookup,
orrery-detail-framing and globe-parity. Every one passed when re-run alone, and a lone re-run
of the full gate passed too. Earlier sessions had hit the same thing. A written rule ("run
landing gates one at a time") did not stop it, because nothing enforced it. A run started
straight after a long one can also start while the first run's Chrome and Vite processes are
still winding down.

A red gate under load costs a full rebase-and-verify cycle. It also invites landing on the
claim that "it's just a flake", without proof.

## Decision

Every test entry point runs inside one machine-wide lock, `scripts/test-lock.mjs`. That covers
`pnpm verify`, `test:unit`, `test:coverage` and `test:e2e` (#224).

- **One lock for all worktrees.** The lock is a directory in the git common dir, which every
  worktree of the repository shares. It records the wrapper's pid and the test process's pid.
  It stays held while either process is alive, so killing the wrapper alone can't let a
  second suite start beside an orphaned one. A lock is cleared when both processes are dead,
  when its owner file has been missing for over 30 s, or when it is more than 3 hours old (a
  leftover from before a reboot, whose pid may since have been reused). A clearer renames the
  lock aside first, so only one waiter can clear it. A waiting run prints which command holds
  the lock, and where. A signal received while waiting still releases the lock.
- **Spaced runs.** After a run that took more than 60 s, the next run first waits until 30 s
  have passed since it ended. It then waits for the 1-minute load average to fall below half
  the core count, for at most 3 minutes.
- **Enforced, not advised.** `playwright.config.ts` and `vitest.config.ts` refuse to start
  unless the lock's environment flag is set. Calling a runner directly fails with the command
  to use instead. The flag also lets `verify`'s inner test steps re-enter the lock rather than
  deadlock.
- `tests/unit/ci-contract.test.ts` requires `verify` and the three test scripts to go through
  the lock. The checks themselves live in `verify:gate`.

The owner asked for this to be enforced rather than remembered.

## Consequences

- Two worktrees can no longer load the machine with tests at the same time. A landing gate
  that fails now points at the change, not at the neighbours.
- Agents wait in turn. A short unit run waits behind a running gate, which can take about 10
  minutes. The lock only serialises the test runs themselves; edits and builds outside
  `verify` still run in parallel.
- Real-GPU screenshot scripts that drive Chromium directly are not test runners, so the lock
  doesn't cover them. Keep them out of the window while a gate is running.
- Revisit if the gate moves off this machine, or if the e2e suite stops being sensitive to
  load. Signs of the second would be per-spec timeouts with headroom, or a single e2e worker.

## Evidence

- `scripts/test-lock.mjs`, `tests/testLockGuard.ts`, `tests/unit/scripts/test-lock.test.ts`.
- `package.json` scripts `verify`, `verify:gate`, `test:unit`, `test:coverage`, `test:e2e`.
- `tests/unit/ci-contract.test.ts`, "runs the gate inside the test lock".
- Issue #224. The per-checkout e2e port it builds on: `tests/e2ePort.ts` (#111).
