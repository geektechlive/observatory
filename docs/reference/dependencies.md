# Dependencies

How dependencies are updated, and why each hold or unusual setup exists. Decisions:
[ADR 0006](../decisions/0006-two-typescripts-side-by-side.md),
[ADR 0007](../decisions/0007-upgrade-dont-pin.md).

- **Updated by hand: `pnpm update`, then `pnpm verify`.** No Dependabot PRs since #33. Dependabot
  security alerts stay on.
- **Re-check every hold against the registry when updating; never keep a pin just to keep it
  (owner, 2026-11-06).** A hold stays only while a primary source still shows the block. #96
  dropped the undici override (wrangler 4.158's miniflare ships the fixed undici 7.30.1) and the
  Dependabot-era `minimumReleaseAgeExclude` block.

## Two TypeScripts, on purpose (#97)

This is Microsoft's documented side-by-side setup from the TypeScript 7.0 announcement.

- `typescript` is `npm:@typescript/typescript6`, a wrapper that resolves to the newest TS 6, for
  typescript-eslint. Its peer range is `>=4.8.4 <6.1.0` on both latest and canary, because TS
  7.0 ships no programmatic API ("We expect TypeScript 7.1 to ship with a new (and different)
  API"). The maintainers told users to stay on TS 6 (typescript-eslint#12518).
- `@typescript/native` is `npm:typescript@^7`, the Go compiler. It provides the `tsc` that
  `pnpm typecheck` and `pnpm build` run. A clean `tsc -b --noEmit` takes 0.39 s on TS 7 against
  2.99 s on TS 6.
- Check `node -e "console.log(require('typescript').version)"`: it must print 6.x.
- When typescript-eslint ships TS 7.1 support (typescript-eslint#10940, PR #12803), drop the
  wrapper and make `typescript` plain TS 7.
- Standalone `tsc` on individual files needs `--ignoreConfig` (TypeScript 6 and 7 alike), or it
  refuses to run because `tsconfig.json` exists (TS5112).
- `functions/` is typechecked via `tsconfig.functions.json` with `lib: ["ES2022"]` and **no DOM
  lib**: workers-types `Response`/`Request` collide with `lib.dom`.

## Pins and holds

- `three` and `@types/three` are exact pins because three.js doesn't use semver: every release
  (r187 = 0.187.0) can break. Bump them together and read the wiki Migration Guide section for
  that release.
- `pnpm-workspace.yaml` holds the accepted advisory list (`auditConfig.ignoreGhsas`, empty since
  #97) plus any `overrides`. Each entry carries why it can't be fixed and when to look again.
- `@types/node` follows the Node the scripts run on in GitHub Actions (`node-version` in
  `data-refresh.yml`, currently 26, the active LTS). Bump the two together.
- satellite.js 7 needs a stub for its multi-thread WASM build:
  [satellites.md](satellites.md#satellitejs-7-97).

## pnpm 12 (#97)

- It reads settings only from `pnpm-workspace.yaml`; package.json's `pnpm` field is ignored.
- Install scripts are allowed per package in `allowBuilds`, currently esbuild, sharp and workerd.
  An undeclared one fails the install.
- It is a native binary. A machine whose global pnpm is older can't self-switch to it (`ENOEXEC`
  on the placeholder `bin/pnpm`), so upgrade the global one with `brew upgrade pnpm`.
- **`minimumReleaseAge` defaults to one day.** Install refuses lockfile entries published less
  than a day ago (`ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION`), and `pnpm update` picks the newest
  version that is at least a day old. Keep it: it is a supply-chain guard. If a fresh release is
  needed urgently, wait the day rather than exempting it.

## History

- **2026-09-09 (Phase 8):** CI had been red on every branch including `main` since 2026-06-20
  (`pnpm/action-setup` with no `packageManager`), and nothing noticed because `main` had no
  required checks. Fixed, plus maplibre-gl 6.9.0 for a critical XSS (GHSA-jrc7-96c5-q579, no 5.x
  backport), 30 advisories down to 1. A plain `pnpm update` cleared 28 transitive advisories that
  Dependabot's grouped PR could not, because it only rewrites direct dependencies. CI and
  Dependabot PRs were then removed on 2026-10-09 ([ADR 0001](../decisions/0001-no-ci-no-prs.md)).
