# 0012. Satellites live in the orrery's Earth frame, from points to haze

Status: Accepted · Date: 2026-11-06

## Context

The orrery's specification asked for thousands of satellites. At solar-system scale every one of
them sits on Earth's dot, and CelesTrak's catalogue is about 19,500 objects and 2.9 MB.

## Decision

The owner chose to draw satellites in the orrery around Earth: crisp, pickable points when the
camera is close, a soft haze farther out, hidden beyond that. They live in the Earth frame, the
inset with its own scale around Earth. Data comes from CelesTrak OMM in nine disjoint KV groups,
written by the refresh job, loaded only when a group is switched on and the frame is open, and
propagated in a worker.

## Consequences

- Nothing about satellites downloads or runs until a visitor nears Earth.
- Starlink and the debris clouds start switched off because of their size (Starlink alone is
  about 520 kB gzip).
- Earth's map has no fitted prime meridian, so a satellite is in the right place in space but not
  over the right spot on the map.
- Revisit the cut-off distances if the camera's field of view or the Earth frame's scale changes.

## Evidence

- #98, #92, #158; commits 8593742, 27535c6.
- `scripts/celestrak-groups.mjs`, `src/lib/orrery/satView.ts`, `three/satLayer.ts`.
- [reference/satellites.md](../reference/satellites.md),
  [reference/orrery-data.md](../reference/orrery-data.md#the-earth-frame-92-renderer-half).
