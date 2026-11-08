# History

The phases Observatory went through, oldest first. Decisions are in [decisions/](decisions/);
this is the record of what was built when.

- **Phase 1 (scaffold and infra):** complete.
- **Phase 2 (map and ISS):** complete. MapLibre, EONET markers and the live ISS tracker.
- **Phase 3 (panels and ticker):** complete. All six panels, the ticker, the footer, App.tsx
  wired.
- **Phase 4 (security and polish):** complete. Self-hosted fonts, CSP, OG/meta/favicon,
  AboutPopover, ApiQuotaMeter, quota tracking, code-split (WorldMap lazy), unit and e2e tests,
  and a three-job CI workflow (removed in #33).
- **Phase 5 (The Instrument):** complete. The stage/console shell, OrbitalDial, a 20-endpoint data
  buildout.
- **Phase 6 (map layers):** complete. NWS alerts, aircraft, buoys, OVATION aurora, FIRMS fires,
  OpenAQ.
- **Phase 7 (audit remediation, 2026-09-07):** complete. Five feeds had been dead behind HTTP 200
  while the header said LIVE; this gave every source a content contract
  ([ADR 0004](decisions/0004-content-contracts-and-issue-per-source-alerts.md)) and set the
  free-plan rules ([ADR 0002](decisions/0002-stay-on-the-cloudflare-free-plan.md)).
- **Phase 8 (dependency and CI remediation, 2026-09-09):** complete. See
  [reference/dependencies.md](reference/dependencies.md#history).
- **2026-10-09:** CI, Dependabot update PRs and PRs themselves were removed on purpose (#33);
  `pnpm verify` replaced them ([ADR 0001](decisions/0001-no-ci-no-prs.md)).
- **Redesign v2 (ROCI v2 and the three.js globe):** complete. Landed 2026-10-13 (edba7ba),
  prototype layout 2026-10-23 (#63), selective bloom and aurora field 2026-10-24 (#50)
  ([ADR 0005](decisions/0005-roci-v2-the-instrument.md)).
- **The orrery (2026-11-06 to 2026-11-08):** the full-page 3D solar system (#91), spacecraft
  (#93), moons (#107), close approaches and the Earth frame (#92), satellites (#98), comets data
  (#99), the JPL queue (#100), Space-Track and DISCOSweb (#101), imagery (#105), links (#108),
  playback (#114), craft models (#115), the satellite browser (#158) and the guide (#159). See
  [reference/orrery.md](reference/orrery.md).
- **Loading pass (2026-11-08):** #155, #162, #167, #168, #169. See
  [reference/bundle-and-loading.md](reference/bundle-and-loading.md).
- **Docs restructure (2026-11-08, #170):** CLAUDE.md cut to rules and pointers; reference docs
  and ADRs in `docs/` ([ADR 0015](decisions/0015-claude-md-holds-rules-docs-hold-the-rest.md)).
