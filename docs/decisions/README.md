# Decisions

Architecture decision records: what was decided, why, and when to revisit it. They are the source
of truth for decisions; `CLAUDE.md` and the reference docs point here. They are public
([0016](0016-decisions-are-public.md)): no secrets, account or zone IDs, email addresses or
personal details. Start a new one from [0000-template.md](0000-template.md), in the same change
that makes the decision.

| ADR                                                           | Decision                                                                                  | Issues         |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------- |
| [0001](0001-no-ci-no-prs.md)                                  | No CI and no PRs: `pnpm verify` is the gate                                               | #33            |
| [0002](0002-stay-on-the-cloudflare-free-plan.md)              | Stay on the Cloudflare free plan, and design to its limits                                |                |
| [0003](0003-kv-first-feeds-for-blocked-upstreams.md)          | Upstreams that block Workers are served KV-first from the refresh job                     | #30, #72       |
| [0004](0004-content-contracts-and-issue-per-source-alerts.md) | Content contracts, and one GitHub issue per source for alerts                             | #21, #71, #120 |
| [0005](0005-roci-v2-the-instrument.md)                        | The visual direction is ROCI Retrofit v2, "the Instrument"                                | #35, #36       |
| [0006](0006-two-typescripts-side-by-side.md)                  | Two TypeScripts side by side: 7 compiles, 6 lints                                         | #97            |
| [0007](0007-upgrade-dont-pin.md)                              | Upgrade, don't pin; lazy bundle budgets are tripwires                                     | #96, #97, #103 |
| [0008](0008-the-orrery-is-a-whole-page.md)                    | The orrery is a whole page, not a lens                                                    | #91            |
| [0009](0009-horizons-sampled-in-the-refresh-job.md)           | Ephemerides are sampled in the refresh job; the client only interpolates                  | #88, #93       |
| [0010](0010-on-demand-jpl-through-one-durable-object.md)      | On-demand JPL lookups go through one Durable Object queue                                 | #100           |
| [0011](0011-sgp4-runs-in-javascript-under-the-csp.md)         | Production propagates satellites in JavaScript; the CSP allows no WebAssembly             | #98            |
| [0012](0012-satellites-live-in-the-earth-frame.md)            | Satellites live in the orrery's Earth frame, from points to haze                          | #98            |
| [0013](0013-space-track-and-discosweb-on-their-terms.md)      | Space-Track and DISCOSweb are read on their own terms, in the refresh job only            | #101           |
| [0014](0014-the-guide-teaches-through-links.md)               | The orrery's guide teaches by doing, through shareable links                              | #159           |
| [0015](0015-claude-md-holds-rules-docs-hold-the-rest.md)      | CLAUDE.md holds rules and pointers; history and measurements live in docs/                | #170           |
| [0016](0016-decisions-are-public.md)                          | This repository's ADRs are public                                                         | #170           |
| [0017](0017-load-performance-floor.md)                        | Load performance has reached its floor                                                    | #177           |
| [0018](0018-the-header-judges-the-view-on-screen.md)          | The header's status judges the view on screen, by that view's own feeds                   | #178           |
| [0019](0019-jonsson-maps-as-in-scene-textures.md)             | Björn Jónsson's maps stay, as downscaled in-scene textures, credited and linked           | #180           |
| [0020](0020-models-ship-through-a-gate.md)                    | A 3D model ships only through the asset gate: licence evidence, a logo check and a budget | #202           |
