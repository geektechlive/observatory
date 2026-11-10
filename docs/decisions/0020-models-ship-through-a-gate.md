# 0020. A 3D model ships only through the asset gate: licence evidence, a logo check and a budget

Status: Accepted · Date: 2026-11-10

## Context

The orrery shows ten spacecraft models today (#115). The owner asked for real models behind
satellites too, and for a close-up detail view (#203). The catalog of candidates
(`docs/reference/satellite-models.md`, tracked in #194) lists about 29 tier-A models from NASA's
3D resources and from Sketchfab artists under CC BY 4.0, plus a CC0 stand-in. A licence review on
2026-11-10 checked each source's own page: every tier-A licence allows display, modification and
redistribution with credit. Two risks remain, and neither is about licences:

- **Marks inside the model.** NASA's insignia and logotype are protected by federal regulation
  (14 CFR 1221), and other agencies' and companies' marks could be baked into a mesh or texture.
  The project's rule is no agency logos or insignia at all.
- **Drift.** With dozens of downloaded files, nothing recorded which source, which version and
  which licence evidence a shipped file came from, or that anyone looked for marks.

Models ship uncompressed, because the CSP has no `'wasm-unsafe-eval'` for Draco or meshopt
decoders (ADR 0011), so every model counts at full size against `check-bundle`'s budgets.

## Decision

Every model has a manifest entry in `scripts/craft-manifest.mjs`: source URL and version, licence
and the evidence for it (quoted text and URL), the SHA-256 of each source file, its family, the
date and result of a check for logos and insignia in the mesh and its textures, and a triangle
budget. `scripts/craft-models.mjs` checks the source hashes, builds into a staging folder and copies
a model to `public/models/craft/` only if its entry is complete and the file is within the
per-model budget. A unit test fails for any shipped file without a complete entry.

The ten models shipped before the gate are marked `legacy`: their source files are not kept in the
repository, so their source hashes and logo checks are recorded as unknown rather than invented,
and the shipped bytes are pinned by hash instead. The build will not copy a legacy entry into
`public/models/craft/`; shipping a rebuild needs the source and a full entry.

CC BY models are credited with the creator, the model URL, the licence URL and a note that the
model was changed. NASA's own Sketchfab uploads are not used; the GitHub and science.nasa.gov copies
are. The total model budget is raised only in the commit that adds models, after a trial batch of
three is measured (ADR 0007).

## Consequences

- A shipped model can always be traced to its source, licence and logo check.
- Adding a model costs a manifest entry and a look at its textures, which is the point.
- The legacy ten stay as they are until someone rebuilds one; then it needs a full entry.
- Revisit if a source's terms change, if a model turns out to carry a mark, or if the CSP ever
  allows WebAssembly decoders (compressed models would change the budgets).

## Evidence

- #202 (the registry and the gate), #194 (the catalog), #203 (the detail view), #115 (the first
  craft models).
- `docs/reference/satellite-models.md`: sources, licences, the asset gate, the budget plan.
- `scripts/craft-manifest.mjs`, `scripts/craft-gate.mjs`, `tests/unit/scripts/craft-manifest.test.ts`.
- ADR 0011 (no WebAssembly decoders under the CSP), ADR 0007 (budgets are tripwires).
- NASA media guidelines: https://www.nasa.gov/nasa-brand-center/images-and-media/ ; 14 CFR 1221:
  https://www.ecfr.gov/current/title-14/chapter-V/part-1221 ; CC BY 4.0:
  https://creativecommons.org/licenses/by/4.0/
