# 0005. The visual direction is ROCI Retrofit v2, "the Instrument"

Status: Accepted · Date: 2026-10-10

## Context

The owner wanted the site "more futuristic, more unique". The earlier "Glass / Luxury Futurist"
direction had already been dropped in code in May 2026, when ROCI copper shipped, but documents
kept calling it locked. A design gate (#35) produced an audit, a direction spec and a three.js
globe prototype.

## Decision

The owner approved ROCI Retrofit v2 at the #35 gate: a reflective copper housing, emissive data
and ops-grade density. The owner's explicit picks: warm hull plates over cool panels; NWS, GDACS
and AQI severities mapped to the three-step status scale rather than their conventional colours;
exaggerated LEO altitude with GEO as a bezel band. Accepted as defaults: both Earth textures
self-hosted, sprite glow on phones and real bloom on desktop, a single-green aurora field.

## Consequences

- The light model holds everywhere: copper and hull are lit from the top left and never glow;
  data glows and is never graded.
- Cyan means spacecraft and telemetry only; MCRN red means hazard only. Data colours come only
  from `src/lib/palette.ts`. Glyph shape is mandatory on the globe, because no bright six- or
  seven-hue set clears every colour-blindness floor.
- The bezel is the one bold element.
- Any departure from the spec is confirmed with the owner first. The Glass direction is history.

## Evidence

- #35, #36, #50, #63; commits 4f897f5, edba7ba, 4ebbc98.
- [design-history/roci-retrofit-v2.md](../design-history/roci-retrofit-v2.md),
  `docs/design-history/mockups-v2.html`.
- [reference/globe-and-design.md](../reference/globe-and-design.md).
