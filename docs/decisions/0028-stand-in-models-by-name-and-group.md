# 0028. Satellites with no model get a labelled stand-in, picked by name and group

Status: Proposed · Date: 2026-11-12

<!-- Proposed, not Accepted: the reach below (which groups get the generic bus) was chosen while
building #194 tier C, not by the owner. The owner's call on it is open; see Consequences. -->

## Context

The satellite models shipped so far (#194, ADR 0020) cover about 53 of the 16,900 active
objects. The rest show no model, and no Look closer button. NASA publishes a generic 2U CubeSat
and a "Satellite Kit" of body, wing and radio parts, both usable under the same terms as the
other NASA models. Their licence page and the logo check are in the manifest
(`scripts/craft-manifest.mjs`).

The catalogue rows carry no payload type or size class (`SAT_FIELDS` in
`src/lib/orbit/satCatalog.ts`). CelesTrak's `active` group (read 2026-11-12) names Planet's
satellites `FLOCK 4A-1` and Spire's `LEMUR-2-WILSON`: 109 and 95 objects, no `DOVE` names.

The owner's earlier wording stays: a family stand-in says "It is not the exact shape of X".
The owner also said that no Starlink, GLONASS, GPS or Tianhe model is built here.

## Decision

- **CubeSat stand-in** (`cubesat`): NASA's 2U CubeSat, for names that start `FLOCK ` or
  `LEMUR-` in an active group. Both fleets are 3U, so it is approximate. Name matching is the
  only option the catalogue gives; the patterns are anchored so a name that merely contains the
  word does not match.
- **Generic bus** (`generic-bus`): a cylinder body, two solar wings and a radio with two dishes,
  three parts of NASA's Satellite Kit placed as NASA's own preview places them.
- **Reach of the generic bus:** the `gps-ops`, `weather`, `science` and `other` groups. Not:
  the three debris groups (a fragment has no bus), `stations` (a small bus is wrong for a space
  station), and `starlink` (a flat-panel design that needs its own model; a generic bus would
  put the wrong picture on two thirds of the dots). Both stand-ins are always family-scoped,
  so they carry the stand-in note, and a model of an object's own, by NORAD id, always wins.
- The classifier is `satFamily()` in `src/lib/orrery/satFamily.ts`.

## Consequences

- About 5,600 more active objects open in Look closer with a labelled stand-in (204
  CubeSats and about 5,430 generic buses); Starlink, stations and debris do not. Which objects exactly is counted in
  `docs/reference/satellite-models.md`.
- GPS and GLONASS (in `other`) show the generic bus until models of their own land. If that is
  unwanted, remove `gps-ops` from `BUS_GROUPS`.
- Starlink gets one line to flip: add `starlink` to `BUS_GROUPS`. Its reserved family slot is
  the place a Starlink model lands.
- A satellite named `FLOCK ` or `LEMUR-` outside the active groups never matches (debris is
  excluded by group first).
- Revisit if the catalogue gains a payload type or size field (a real CubeSat test), or when the
  owner decides on Starlink or the stations.

## Evidence

- `src/lib/orrery/satFamily.ts` and `tests/unit/orrery-sat-family.test.ts`.
- `scripts/craft-manifest.mjs` entries `cubesat` and `generic-bus`; `scripts/craft-models.mjs`
  `buildGenericBus`.
- `docs/reference/satellite-models.md`, "Stand-ins, labelled as stand-ins" and "The fourth
  batch".
- Issue #194; ADR 0020 (the asset gate).
