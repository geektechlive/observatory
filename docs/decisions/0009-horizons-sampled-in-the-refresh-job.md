# 0009. Ephemerides are sampled from JPL in the refresh job, and the client only interpolates

Status: Accepted · Date: 2026-11-06

## Context

The orrery needs spacecraft, Earth, the Moon, planetary moons, close-approach asteroids and comets
at any date the clock shows. JPL Horizons answers 503 to overlapping requests from one address
(#88), JPL's fair-use terms ask for one request at a time, a Worker has 10 ms of CPU, and KV
allows 1,000 writes a day.

## Decision

The refresh job samples JPL (Horizons, CAD, Scout, SBDB) one request at a time with a pause and a
budget, and writes each payload to KV in one write with its age in the metadata: craft and moons
in `horizons:bodies:v1`, close approaches in `horizons:neo:v1`, comets in
`horizons:smallbodies:v1`. The Functions stream those bodies through without parsing them. The
client interpolates (Hermite on fine spans, Catmull-Rom on coarse ones) and never extrapolates:
outside the samples a body is hidden and the inspector says "no data for this date".

## Consequences

- No visitor request reaches JPL for these bodies, and positions match Horizons to kilometres
  inside the samples.
- Data covers a window around now (about ±30 days fine, whole missions coarse); other dates show
  less, and say so.
- Shared modules the Node job imports (`horizons.ts`, `craft.ts`, `moons.ts`, `satCatalog.ts`,
  `conic.ts`) take no imports and use erasable syntax only.
- Arbitrary objects a visitor searches for go through the JPL queue instead
  ([ADR 0010](0010-on-demand-jpl-through-one-durable-object.md)).
- Revisit if JPL offers a bulk feed that can be read on the request path.

## Evidence

- #88, #93, #92, #107, #99; commits 39939d2, 7f2c449.
- `scripts/orrery-bodies.mjs`, `scripts/orrery-neo.mjs`, `scripts/orrery-smallbodies.mjs`,
  `src/lib/orrery/ephemeris.ts`.
- [reference/orrery-data.md](../reference/orrery-data.md).
