# 0006. Two TypeScripts side by side: 7 compiles, 6 lints

Status: Accepted · Date: 2026-11-06

## Context

TypeScript 7.0 (the Go compiler) shipped without a programmatic API. typescript-eslint needs that
API: its peer range is `>=4.8.4 <6.1.0` on latest and canary, and its maintainers told users to
stay on TS 6 (typescript-eslint#12518). TS 7 type-checks this repo in 0.39 s against 2.99 s on
TS 6.

## Decision

Use Microsoft's documented side-by-side setup (#97): `typescript` is
`npm:@typescript/typescript6` for typescript-eslint, and `@typescript/native` is
`npm:typescript@^7`, which provides the `tsc` that `pnpm typecheck` and `pnpm build` run. Stay on
ESLint rather than move to a linter that can't run the custom design-lint rule.

## Consequences

- Type-checking gets TS 7's speed now, without losing typed lint rules.
- Two compilers can disagree on an edge case; `require('typescript').version` must print 6.x.
- Revisit when typescript-eslint supports TS 7.1 (typescript-eslint#10940, PR #12803): drop the
  wrapper and make `typescript` plain TS 7.

## Evidence

- #97; commit 8b90757.
- `package.json` (`typescript`, `@typescript/native`).
- [reference/dependencies.md](../reference/dependencies.md#two-typescripts-on-purpose-97).
