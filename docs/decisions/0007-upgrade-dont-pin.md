# 0007. Upgrade, don't pin: a hold needs current primary-source evidence

Status: Accepted · Date: 2026-11-06

## Context

Planning the orrery, satellite.js was held on v5 for a reason written two months earlier ("v7
can't bundle"), and several features were called gaps. Re-checked against the registry, v7 had
what was needed (OMM input, bulk WASM propagation), and most "gaps" had free paths. Separately, a
lazy chunk's bundle budget was treated as needing the owner's approval to raise after a routine
maplibre upgrade (#103).

## Decision

The owner: "don't keep a pin just to keep a pin… I don't want to keep building technical debt".

- Every pin and hold is re-checked against the registry when dependencies are updated. One stays
  only while a primary source (an upstream issue, a quoted peer range) still shows the block.
- An upgrade that closes a gap comes before a workaround.
- Lazy-chunk bundle budgets are tripwires for accidental growth. A deliberate upgrade that pushes
  one over raises it in the same commit, with the measured delta in the message. Only a rise in
  the first-load budget is flagged to the owner.

## Consequences

- #96 dropped the undici override and the Dependabot-era release-age exclusions; #97 took
  satellite.js 7, TS 7 side by side, pnpm 12, stylelint 18 and jsdom 31.
- Majors land more often, each through the full gate.
- Real holds remain documented with their evidence: `three` is an exact pin because it doesn't use
  semver; typescript-eslint keeps TS 6 for lint ([ADR 0006](0006-two-typescripts-side-by-side.md)).
- This is a standing rule; revisit only if an upgrade breaks production in a way the gate could
  not catch.

## Note, 2026-11-17: an accepted advisory is a hold too (#258)

`pnpm audit` began failing every landing on picomatch's ReDoS advisory GHSA-fc5q-39xc-vjpf. It
flags every version up to 4.0.7, the latest, so there was nothing to upgrade to. The owner chose
to accept that one advisory in `audit.ignore` (`pnpm-workspace.yaml`) and not hold every landing.
It reaches only build and test tooling, never the site or the Functions. An ignored advisory follows
this ADR's rule for holds: its entry states why it can't be fixed, why it doesn't reach us, and
when to look again, and it goes once a fixed version ships.

## Evidence

- #96, #97, #103; commits ff5c25f, 8b90757.
- `pnpm-workspace.yaml`, `scripts/check-bundle.mjs`.
- [reference/dependencies.md](../reference/dependencies.md).
