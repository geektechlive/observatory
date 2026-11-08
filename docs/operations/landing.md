# Landing a change

There is no CI and there are no PRs ([ADR 0001](../decisions/0001-no-ci-no-prs.md)).
`pnpm verify` is the only gate, and a push to `main` deploys to production.

## Steps

1. Material work starts as a GitHub issue labelled with an area (`infra`, `web`,
   `documentation`, …) and a priority `P0`–`P3`.
2. Work in a worktree under `.claude/worktrees/<name>` (gitignored). Run
   `pnpm install --frozen-lockfile` first.
3. Tests come first: write the failing test and see it fail, then the code. One commit per unit,
   referencing its issue.
4. `pnpm verify` passes in the worktree: lint, typecheck, unit tests with coverage thresholds,
   build (with `check-bundle`), e2e, and `pnpm audit --audit-level=high`. ESLint runs with
   `--max-warnings 0` (#113): a warning fails the gate, because 27 standing warnings once hid
   new ones.
5. To land:
   1. Fetch, rebase the worktree branch onto `origin/main`, and re-run `pnpm verify`. Two changes
      can each pass alone and break together.
   2. Leave the worktree. In the main checkout, `git pull`, then `git merge --squash <branch>`,
      then commit with `Closes #N, closes #M` (one keyword per issue) and push. Run
      `pnpm install --frozen-lockfile` in the main checkout first if its `node_modules` may lag
      the lockfile, or the pre-commit lint fails with hundreds of "type could not be resolved"
      errors.
   3. Remove the worktree and the branch.
6. When a change deserves a look first, push the branch for a Cloudflare preview URL before
   merging. Roll back with `git revert`, or to the previous Pages deployment.
7. A PR is only for when the owner wants to review something before it goes live.

## The gate's own guard

`tests/unit/ci-contract.test.ts` asserts that `pnpm verify` runs every check (using
`test:coverage`, because `vitest.config.ts` enforces thresholds), that `packageManager` pins pnpm,
and that every `pnpm <script>` a remaining workflow invokes exists. Dropping a check from
`verify` drops it entirely, because nothing else runs it.

`tests/unit/claude-md-size.test.ts` fails when `CLAUDE.md` passes 20 KB
([ADR 0015](../decisions/0015-claude-md-holds-rules-docs-hold-the-rest.md)).

## Workflows that stay

`.github/workflows/data-refresh.yml` is production operations, not CI: the KV refresh job and the
health check. See [data-feeds-and-monitoring.md](../reference/data-feeds-and-monitoring.md).
