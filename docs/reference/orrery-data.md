# Orrery data: craft, moons, close approaches, comets, on-demand JPL

Where the orrery's bodies come from, how they are sampled, stored and drawn, and the
measurements behind each choice. The page itself (renderer, presets, labels, links, guide,
imagery) is in [orrery.md](orrery.md); satellites are in [satellites.md](satellites.md).
Decisions: [ADR 0009](../decisions/0009-horizons-sampled-in-the-refresh-job.md),
[ADR 0010](../decisions/0010-on-demand-jpl-through-one-durable-object.md).

## Spacecraft, Earth and Moon (#93)

They come from JPL Horizons, sampled by the refresh job, never on the request path.

- **The job:** `scripts/orrery-bodies.mjs`, called from `refresh-data.mjs`, asks Horizons for
  heliocentric ecliptic J2000 vectors, one request at a time with a 1 s pause and a 4-minute
  budget. That's 44 requests and about 55 s.
  - It covers the 17 bodies in `src/lib/orrery/craft.ts`.
  - Each body gets a fine span, 30 days either side of now, position and velocity.
  - Each craft also gets a whole-mission span, positions only, refetched once a day. Fast
    loopers cap its step with `maxCoarseStepDays`: Parker every 3 days, because its 88-day orbit
    drew as a jagged polygon at 25-day steps.
  - A span past the ephemeris is clamped to Horizons' "No ephemeris … after/prior to" limit and
    asked again.
  - A reply naming the wrong target is rejected, and a failed object goes into `missing` while
    the rest still ship.
- **One KV write, value and metadata together** (`kvPutInit`'s multipart form): key
  `horizons:bodies:v1`, about 240 KB (100 KB gzip), about 4 writes a day.
- **The Function streams that body through without parsing it** (10 ms of CPU).
  `/api/orrery-bodies` gets its age from the metadata via `getWithMetadata`.
  - Up to 72 h old: fresh.
  - Older or undated: degraded with `X-Error-Kind: upstream`.
  - Missing: our 503.
- **`src/lib/horizons.ts` and `src/lib/orrery/craft.ts` have no imports and use erasable syntax
  only,** because the `.mjs` job imports them under Node's type stripping (Node 26). Keep them
  that way.
- **The client interpolates; it never extrapolates** (`src/lib/orrery/ephemeris.ts`).
  - Hermite on the fine span reproduces Horizons' own 12 h samples to within 1–15 km.
  - Catmull-Rom on the coarse span is marked coarse.
  - Outside both: "no data for this date". The craft is hidden but stays in search.
- **Earth is drawn from the same Horizons answer when it covers the date,** so the L1 craft sit
  where they should; outside it, Earth is Kepler, and the inspector says so.
- **The L1 & L2 group is off by default:** at the solar-system scale those craft sit on Earth's
  marker. The Earth frame (below) separates them, with Earth's Moon (drawn since #107), as you
  near Earth; the Earth–Moon preset turns the group on.
- **DSN `spacecraftID` is the NAIF id.** `dsnContactsById` gives the ring on a craft in contact
  and the "Only in DSN contact" filter.
- **Deep-space craft outside the view become rim markers** (`rimPoint`, `spreadRim`), kept clear
  of the time bar and of each other.
- **Heliosphere with craft is its own view (`frameView` in `three/framing.ts`):**
  - Low, 20° above the ecliptic, so north and south of the plane read as up and down.
  - Aimed at the centre of Neptune's orbit plus the deep-space craft, not at the Sun.
  - At the azimuth (of 24 tried) that puts the craft farthest from the Sun on screen relative to
    Neptune's orbit.
  - At the distance that keeps them all in view and above the time bar; the page passes the
    bar's height through `setFrameReserve`.
  - Why: from 30° up, aimed at the Sun, Voyager 1 (99 au north) projected right beside the Sun
    and read as "near the Sun". Before that, Voyager 2 (90 au south) fell below a ring-only
    frame.
  - It refits when craft arrive, when the filter changes, and when the sim date moves 180 days,
    as long as the camera hasn't been moved. With no craft data it falls back to the Sun-centred
    200 au ring.
  - Rim markers are left only for craft genuinely out of view.
- **Stalks** (`craftLayer.ts`): a craft more than 1 au off the ecliptic gets a thin line to the
  plane (dashed when south) and a cross where it lands. The classic orrery cue. They follow the
  Orbits switch.
- **Heliopause.** The ring is a faint dashed circle at 121.6 au, labelled "approx.".
  - Source: NASA/JPL date Voyager 1's crossing to Aug. 25, 2012 (2013-09-12 release), and JPL
    Horizons puts it 121.60 au from the Sun that day (`HELIOPAUSE_V1_AU`).
  - The label hides on stages under 600 px, where it ran across the planets.
- **Craft labels get priority:** craft in DSN contact and the deep-space ones rank just after the
  voice line's subject (`labelOrder`'s `boosted`). On a phone, Voyager 1's label used to lose to
  Juno's.
- **Checked against Horizons' own observer quantities on 2026-11-07:**

  | Craft     | Horizons                           | Inspector                                  |
  | --------- | ---------------------------------- | ------------------------------------------ |
  | Voyager 1 | 172.953 au, 29.75 km/s, 1438.4 min | 172.96 au, 29.8 km/s receding, 23 h 58 min |
  | Parker    | 0.9544 au, 0.16 km/s               | 0.954 au, 0.2 km/s                         |

## Major moons (#107)

They ride in the same job and payload, relative to their planets.

- The catalogue is `src/lib/orrery/moons.ts`: 14 moons of Mars, Jupiter, Saturn, Uranus and
  Neptune. It has no imports, like `craft.ts`. Each id was checked live on 2026-11-07, and period
  and semi-major axis come from Horizons' physical-data header. Charon is left out (see
  [Dwarf planets](#dwarf-planets-99-item-8)).
- The job asks `CENTER='500@<planet>'` at the coarsest step that gives 14 samples per orbit
  (`moonStepDays`): Phobos every 30 min (`stepSize` writes minutes), Io every 3 h, Enceladus,
  Miranda and Deimos every 2 h, Titan daily. Hermite stays within 100 km of Horizons for Io.
- The window is ±15 days (`MOON_WINDOW_DAYS`), shrunk for a fast moon to stay under
  `MOON_MAX_SAMPLES` (400): Phobos gets ±4 days (`moonWindowDays`).
- The moons go in a separate `moons` array (`OrreryMoonSchema`, `center` and `parent` on each),
  never in `bodies`. Zod strips unknown keys, so a client that predates moons drops them, and its
  heliocentric code never sees planet-centred vectors. That's why the key stayed
  `horizons:bodies:v1`. An old KV copy parses with `moons: []`.
- A moon that fails goes into `missing`. The health contract still requires only `bodies`.
- Cost, measured in a full dry run on 2026-11-07 with Phobos and Deimos: 58 requests in 80 s,
  and a payload of 419 KB (160 KB gzip), up from 242 KB before moons. Steady-state runs reuse
  the whole-mission spans.
- Placement is `moonScenePosition` (`src/lib/orrery/moonPlacement.ts`): an exaggerated log scale
  in planet radii as drawn, `R·(1.6 + 1.2·log10(1 + d/100,000 km))`, with `place3d`'s axes. Not
  to scale; the inspector says so (`MoonFacts.tsx`). Saturn's moons start outside its rings
  (`moonClearance`), or Enceladus would sit inside them.
- **Earth's Moon is drawn too, from data already fetched:** Moon minus Earth, both heliocentric
  from the same DE441 answer (`src/lib/orrery/moonState.ts`), placed by the Earth frame's scale
  rather than `moonScenePosition` (#92), so it shares one scale with the L1 craft and the close
  approaches. Only fine spans are used for any moon: never coarse, never extrapolated.
- **When moons show** (`moonsShown` in `three/moonLayer.ts`): with a planet focused, only its own
  moons; with none focused, a planet's once it is in view and drawn at least `MOON_SHOW_PX` (36)
  in radius. Measured on the 1440 px stage: presets draw planets at 26 px at most, a focused
  planet at 42, and focusing Mars still draws Jupiter at 42, which is why a size rule alone would
  not do. Choosing a moon in search focuses its planet. The canvas's `data-orrery-moons` and
  `data-orrery-sizes` let e2e check this.
- Craft and moon labels step off planets' drawn discs (`layoutLabels`' `discs`; #105's
  Juno-on-Jupiter nit).
- **Moon orbit lines** (`src/lib/orrery/moonOrbit.ts`): one period of the moon's own samples
  around the date, on a grid through the date so the moon is a vertex; when the window is shorter
  than a period (Iapetus), the osculating ellipse from the state now, with μ from Kepler's third
  law and Horizons' period and semi-major axis. The inspector says which. The layer writes each
  loop at unit radius into a fixed buffer and scales the line by the planet's drawn radius
  (`moonScenePosition` is linear in it), so the dot stays on its line with no geometry churn.
  Shown only with their moons, under the Orbits switch. The canvas's `data-orrery-moon-orbits`
  counts them.

## Close approaches (#92, data half)

They come from JPL CAD, placed with Horizons, plus JPL Scout and ESA NEOCC, in
`horizons:neo:v1`. `scripts/orrery-neo.mjs` runs in the refresh job right after the craft step,
so the two never ask JPL at once; CAD, Scout and Horizons share one paced queue (1 s, 2-minute
budget).

- CAD is asked for 0.05 au over now ±30 days (#136; ±10 before) with full names, then again with
  `pha=true` to mark hazardous objects (one request, no SBDB lookups). Pass explicit `YYYY-MM-DD`
  dates: `date-min=now-10` is a 400.
- **40 objects, one row each (its closest approach)** (`selectApproachesAround`): up to 25 from
  within ±10 days of now, then the rest of the month fills the other 15, each part PHAs first,
  then the closest. CAD lists about 200 objects over ±30 days (199 on 2026-11-07), so ranking the
  month alone would skip most of this week's.
- **Each object costs one Horizons request at 3 h over ±30 days, stored as two Hermite spans**
  (`splitApproachSpans`): `fine` keeps every 8th sample (daily, 61), `close` every sample within
  ±3 days of CAD's closest approach (up to 49). Why: re-interpolating the live 3 h samples, a
  daily step stays at the 1.5 km rounding floor away from the pass, but near a pass inside a
  lunar distance Earth bends the path and a 12 h step was off by up to 2,000 km (2026 VL5 at
  0.14 LD); daily-only was off by 33,000 km for 2026 TP128. A uniform 3 h step over ±30 days
  would be about 35 KB per object. `asteroidState` uses `close` where it covers the date, else
  `fine`; `approachPathTimes` draws the chosen pass from both. Copies written before #136 parse
  with `close: null`.
- **Naming a small body (`src/lib/orrery/closeApproach.ts`):** a numbered asteroid is `'433;'`, a
  provisional one `'DES=2026 UE2;'`. `DES=433;` returns 248370 (2005 QN173), checked live
  2026-11-07, so `targetMatchesDesignation` checks every answer's target name; a mismatch goes
  into `missing`. `fetchSpan` in `orrery-bodies.mjs` takes the command and that check.
- **ESA NEOCC** flat files (`neo.ssa.esa.int/PSDB-portlet/download?file=esa_risk_list` and
  `esa_upcoming_close_app`) are pipe tables; NEOCC writes `2026VZ3` where JPL writes `2026 VZ3`
  (`neoccDesignation`). The payload keeps the risk list's top 50 by Palermo scale plus any placed
  object on it (`riskListed`), and all upcoming approaches.
- A CAD failure fails the step, judged by the KV copy's age (36 h). Scout, NEOCC, the PHA filter
  or a single asteroid failing ships as a warning listed in `missing`.
- Measured in a live dry run on 2026-11-07 (#136): 43 JPL requests in 67 s, 39 of 40 placed
  (2026 VO5 is in CAD but not yet in Horizons' small-body index: "No matches found"), 414 KB
  (139 KB gzip). Before #136: 28 requests, 38 s, 25 objects, 391 KB (132 KB gzip).
- `/api/orrery-neo` streams it through like `/api/orrery-bodies` (both use
  `functions/api/_kvBody.ts`), degraded past 36 h. `useOrreryNeo` fetches it, through
  `useNearEarth` on the orrery page.

## The Earth frame (#92, renderer half)

An inset around Earth (`src/lib/orrery/earthFrame.ts`, `three/earthNeighbourhood.ts`). At
`place3d`'s scale a 0.05 au pass sits on Earth's dot, so near Earth distances use their own
scale, in Earth radii: true out to GEO (6.6, for the satellites of #98), then
`GEO + 4·log10(d/GEO)` beyond. The Moon lands near 10.5, L1 and L2 near 12.8, a 0.05 au pass
near 15.6. Direction is kept; not to scale beyond GEO, and the inspector says so.

- **Once open, Earth is drawn at the frame's unit** (`EARTH_FRAME_UNIT`, 0.0085 scene units per
  Earth radius) and the other bodies shrink to their px floor. The first version drew the frame
  at Earth's exaggerated radius (0.048): a 0.05 au pass then landed beyond Venus, which was drawn
  huge beside it. Now the whole neighbourhood (0.1 au is 0.145 units) stays inside half the way
  to Venus at its closest (0.31).
- **When it opens** (`earthFrameBlend`): by the camera's distance to Earth in frame units,
  log-linear from 620 (closed) to 110 (open), times the target's distance (open within 18 units,
  closed past 30). Focusing Mars or Venus never opens it. The camera range matches Earth's
  exaggerated radius over the unit, so Earth keeps its px size while it opens. The Inner preset
  sits near 965 (closed). Closed in the proportional mode and whenever Horizons' Earth doesn't
  cover the date (the Kepler Earth is the Earth–Moon barycentre, about 4,700 km off).
- **What lives in it:** Earth's Moon (`moonLayer`'s `placementFor`), any craft within 0.1 au of
  Earth (`CraftLayer.placeNear`: the L1/L2 ones, Europa Clipper on its flyby), the close
  approaches (`AsteroidLayer`: amber, red for PHAs, the chosen one's sampled pass), the Sun–Earth
  line and an L1 marker. One scale for all of them, so Moon < L1 < a 0.05 au pass holds on
  screen.
- **Asteroids** are Hermite on their Horizons samples minus Horizons' Earth
  (`src/lib/orrery/asteroids.ts`), never extrapolated. On the live payload of 2026-11-07 the
  samples find CAD's closest approach within 30 minutes and 2% for all four objects tested, and
  the range rate flips sign at it (`orrery-asteroids.test.ts`). On the #136 dry-run payload (39
  objects) the time was within 0.7 min for all, and the distance within 1% for all but 2026
  TP128, which passed 7,490 km from Earth's centre (about 1,100 km up): 6.8% off, because that
  pass takes minutes and the samples are 3 h apart.
- **The Earth–Moon/L1 preset** (`earthPresetView`) aims at Earth from beside the Sun–Earth line,
  so L1 and L2 sit to either side, 13.5 frame units held above the time bar, and follows Earth.
  Focusing Earth uses its distance; a close approach, L1 or an L1/L2 craft is focused from 40
  frame units, with the frame forced open for the flight's target (`placeEarthFrame(true)`).
- **Controls** (`NeoControls.tsx`): closest approach within a day, a week or 30 days (#136; the
  default, and everything at today's date, since the payload covers ±30 days; scrubbed away from
  today it still means 30 days of the date shown), hazardous only, ESA risk list only, each
  explained in place; JPL Scout's unconfirmed objects with NEO score and sky uncertainty (no
  position: too new for an orbit); and the Space weather switch for the Sun–Earth line and L1.
- **Inspector** (`NearFacts.tsx`): an approach's CAD distance with its 3-sigma range, where it is
  now, size (from H for albedo 0.25–0.05 when JPL has no diameter), ESA's view, and spec Part
  12's four terms kept apart (passes near Earth, potentially hazardous, modelled impact chance as
  a model output, confirmed impact: always no). L1: the solar wind from `useSolarWind`, the
  transit time from L1 at that speed, and the next CME's ETA from `useCme` (an arrival time
  only: ENLIL gives no position).
- Canvas data for e2e: `data-orrery-earth-frame` (0 to 1), `-asteroids`, `-asteroid-path`,
  `-l1`. `e2e/orrery-neo.spec.ts` mocks the payload along `moonPayload.ts`'s Earth
  (`neoPayload.ts`); the soak cycles through the Earth–Moon preset.

## Comets and interstellar objects (#99, data half)

They are `horizons:smallbodies:v1`. `scripts/orrery-smallbodies.mjs` runs in the refresh job
after the close-approach step, through the same kind of paced JPL queue (1 s, 90 s budget).

- **Which comets:** SBDB Query for comets within a year of perihelion, inside 5 au, at full
  precision (`sbdbCometQueryUrl`), then the twelve JPL's own magnitude law makes brightest
  tonight, T = M1 + 5 log Δ + K1 log r, down to 18 (`selectComets`). A cut at 15 left two comets
  on 2026-11-07. Split-comet fragments (`240P-B`) and the interstellar objects are left out.
- **The interstellar objects** are `INTERSTELLAR` in `src/lib/orrery/smallBodies.ts`: 1I
  (`A/2017 U1`, filed as an asteroid), 2I (`C/2019 Q4`), 3I (`C/2025 N1`). Each also gets a long
  span from three years before perihelion to five years ahead, positions only, reused for a day.
  The steps (5, 10 and 5 days) keep Catmull-Rom within 0.0028 au of the path at 1I's perihelion,
  under 1,000 km for 2I and 3I.
- **Naming them to Horizons (checked live 2026-11-07):** a bare SPK-ID is refused ("out of
  bounds"); `DES=<SPK-ID>;` lists every apparition of a periodic comet instead of answering;
  `DES=<SPK-ID>;CAP;NOFRAG` works for comets but searches comets only, so 1I is asked
  `DES=50788063;`. Every answer's target name is checked (`targetMatchesSmallBody`).
- **Elements and provenance come from the same answer's header** (`parseSmallBodyHeader` in
  `horizons.ts`): osculating elements, M1/k1 (or 1I's H), the solution and its data arc. Outside
  the arc the path is extrapolated. When Horizons fails, a comet keeps SBDB's elements
  (`elementsSource`).
- **Two-body is only a fallback.** `src/lib/orrery/conic.ts` solves ellipses, parabolas and
  hyperbolas (no imports, so the job uses it too). Against Horizons it is within 2,000 km for 3I
  a few days from its epoch, but 4.2 million km off for 161P and 1I, whose elements are years
  old. Draw from the spans; use the conic outside them and say so.
- **v∞ is for the visitors only:** 26.4, 32.3 and 58.0 km/s. A comet's osculating e can be just
  over 1 (C/2024 T5, 1.0022) while it is still bound.
- Measured in a live dry run on 2026-11-07: 19 JPL requests in 26 s, all 15 placed, 164 KB (72
  KB gzip). One KV write a run.
- `/api/orrery-smallbodies` streams it through `_kvBody.ts`, degraded past 72 h. Health requires
  a non-empty `interstellar` list, since comets can be few. `useOrrerySmallBodies` fetches it,
  for the Tonight panel and the orrery (below).
- **In the orrery (#99, drawing half):**
  - **Switches:** "Comets & interstellar" in the controls (`SmallBodyControls.tsx`), Comets and
    Interstellar objects, both off at first. The payload (72 KB gzip) is fetched only once a
    switch or a link asks (`useOrrerySmallBodies({ enabled })`, `useSmallBodies.ts`), so a plain
    visit to the orrery fetches nothing new. Once loaded, the objects are in the Find box.
  - **Marker from the samples only** (`smallBodyState` in `smallBodyView.ts`): the fine span
    (±30 days, `FINE_WINDOW_DAYS`), then for 1I/2I/3I the coarse span. Outside them the marker
    and its line are hidden; the conic never places a position.
  - **Lines** (`smallBodyLayer.ts`): an interstellar object's coarse positions, every one (1I
    has about 1,300). A comet's orbit from its elements (`conicPath` in `conic.ts`), sampled in
    true anomaly, closed for an ellipse whose aphelion is inside the cut, else the arc inside
    it. The cut is max(8 au, 2q, 1.25 × the farthest fine sample) (`pathCutAu`). Elements years
    from their epoch (161P's are from 2021) can leave the line visibly off the marker.
  - **Size:** 3 px floor, `PX_CEILING.smallBody` 5 px, under the Sun's 10 px floor (#195).
  - **Colours:** comets in the hydro lane's pale blue, interstellar objects in the "Space
    objects" violet that a looked-up object also uses.
  - **Inspector** (`SmallBodyFacts.tsx`): only what the payload carries. Eccentricity for all;
    "hyperbolic", v∞ and the discovery date for 1I/2I/3I only. The solution, and whether the
    date shown lies inside the data arc it is fitted to (`solutionAt`, whole UTC days).
  - **Keys and links:** `sbc:<SPK-ID>` (`smallBodyKey`), not the payload's `sb:` id: close
    approaches are `sb:<designation or number>` (`scripts/orrery-neo.mjs`) and the renderer
    looks them up first, so a shared prefix could hide a comet. A link to an `sbc:` key the
    catalog lacks asks for the payload, waits for it, switches the object's group on and
    opens it (`useOrreryLink.ts`); no other key triggers that fetch.
  - **Drawn once:** a JPL lookup of the same object (`lookup:<SPK-ID>`, #145) hides its own
    marker and line while the payload's copy is drawn, and its key follows that copy.
- **"Comets tonight" in the Tonight panel (#99)** is our stand-in for JPL's missing sb_obs
  (`CometsTonight.tsx`, `src/lib/sky/`). It is fetched only once the user shares a location,
  from our own API, so the location goes nowhere new.
  - `topocentric.ts`: the Hermite span minus JPL Table 1's Earth–Moon barycentre, corrected for
    light time, turned to the equator of J2000, precessed to the date (IAU 1976), turned with
    Earth by mean sidereal time, then seen from the observer on WGS84 through east-north-up, so
    parallax is exact. Nutation, aberration and refraction are left out. Against Horizons'
    observer table for C/2024 T5 from Kitt Peak (`fixtures/tonight/`): RA/Dec within 0.001°,
    altitude and azimuth within 0.008°.
  - `cometsTonight.ts` samples the dark window from now (Sun below −18°, `darkWindow`) every 10
    minutes, keeps each object's highest point above 10°, and rates JPL's law there: naked eye to
    6, binoculars to 9, small telescope to 12, an 8-inch to 14 (`FAINTEST_LISTED`). Those limits
    are an observers' rule of thumb, set a magnitude or two brighter than for stars because a
    comet's light is spread out. Fainter comets aren't listed; the brightest of them is named in
    the empty state.
    1I has no magnitude law (only H) and is skipped.
  - On 2026-11-07 the brightest were C/2024 T5 (13.3) and C/2026 A2 (13.9), both 8-inch objects:
    a quiet month.

## Dwarf planets (#99 item 8)

Pluto, Ceres, Eris, Makemake and Haumea, in `horizons:dwarfs:v1` (`/api/orrery-dwarfs`), a key
of their own. Owner's call, 2026-11-12: a "Dwarf planets" switch, off at first, and never in
`/api/orrery-bodies`, which every orrery visit loads.

- **Why a key of their own** ([ADR 0023](../decisions/0023-optional-orrery-data-has-its-own-key.md)):
  the first build put them in the comets' `/api/orrery-smallbodies`, which the Tonight panel
  also loads every 30 minutes once a location is shared. That would have taken every Tonight
  visitor from 71.9 KB to 129.7 KB gzip. Measured in dry runs on 2026-11-12 after the split: the
  comets' payload is 164,428 bytes (71,885 gzip) with no `dwarfs`, the dwarf planets' 131,265
  (58,775 gzip). `tests/e2e/orrery-dwarfs.spec.ts` checks the Tonight panel never asks for them
  and the switch never asks for the comets.
- **Served** like the other orrery bodies: `functions/api/orrery-dwarfs.ts` streams the KV body
  through `_kvBody.ts` unparsed, degraded (`X-Data-Source: kv-backup`, `X-Error-Kind`) past 72 h,
  503 until the first write. Health contract `orrery-dwarfs` (a non-empty list, not a headline
  source: no view always fetches it, ADR 0018) and a probe in `scripts/check-health.mjs`.
- **Asking Horizons** (`src/lib/orrery/dwarfs.ts`, no imports, so the job uses it): `'9'` for
  Pluto's system barycentre (DE441, "Pluto Barycenter (9)"), `'1;'`, `'136199;'`, `'136472;'` and
  `'136108;'` for the others; never `DES=`. Every answer's target name is asserted exactly.
  Positions only, at 6 decimals (`toSpan`'s `decimals`).
- **Coverage, checked live 2026-11-12:** '9' covers 3000 BC to 3000 AD, so Pluto's span is asked
  from 3005 BC to 3006 AD, past both ends of the clock. Ceres, Eris, Makemake and Haumea answer
  "No ephemeris ... prior to A.D. 1599-DEC-11" and "after A.D. 2501-JAN-01", so they are asked
  for 1600-01-01 to 2500-12-31. Outside that their marker hides, their orbit stays, and the stage
  says so (`dwarfNotice`, with the years read from the span itself, rounded to decades: Ceres's
  last sample is 2500-11-18, the others' 2499-11-23).
- **Steps:** 1826 days; 120 for Ceres. Catmull-Rom against Horizons' own positions halfway
  between samples, around each body's perihelion (`tests/unit/fixtures/dwarfs/`): worst
  0.0046 au for Pluto, 0.0047 Ceres, 0.0037 Eris, 0.0037 Makemake, 0.0041 Haumea (limit 0.01).
- **Measured** in a local dry run (`--only=orrery-dwarfs --dwarfs-out=…`), one
  request at a time, 2026-11-12: 5 requests in 11 s; Pluto 1,203 rows, Ceres 2,743, the other
  three 181 each; 131,315 bytes, 58,813 gzip.
- **In the refresh job:** their own step (`scripts/orrery-dwarfs.mjs`, 60 s budget within the job's
  deadline), after the comet step and never beside it. Spans are reused for a day (`coarseFetchedAt`), decided per
  body, so the first run after this landed fetched them. A body that fails keeps its last span and
  is listed in `missing`, and the next run asks for it again rather than a day later. Until that first production run the key is empty, the endpoint answers
  503, and the switch says there is no dwarf-planet data yet.
- **The line** is the closed two-body orbit from SBDB's osculating elements (`conicPath`,
  `full-prec=1`, fetched 2026-11-12; Pluto's are orbit 1 at 2016-07-19, the rest 2026-06-09). It
  holds the shape, not the position along it: measured on the real spans, the worst gap from a
  sample to its line is 0.63 au for Pluto (2836 BC), 0.37 Eris, 0.22 Makemake, 0.21 Haumea, 0.07
  Ceres, and even within a century of the epoch the outer four reach 0.16 to 0.24 au
  (likely cause, not checked: heliocentric osculating elements of a distant body wobble with
  Jupiter). The marker always comes from the span. The design's estimate of 0.16 au for Pluto did not hold.
- **Drawing** (`dwarfView.ts`, `smallBodyLayer.ts` as a third group): 4 px floor,
  `PX_CEILING.dwarf` 6 px, under the Sun's 10 px; pale rose `--dwarf` (`oklch(0.8 0.09 345)`,
  `DWARF_HEX`), neither spacecraft cyan nor hazard red. Real-GPU shots at 1920x1080 with the
  real spans: all five drawn at 4 px against a Sun of 10 px (whole system) to 16 px (Pluto
  selected).
- **Pluto is the barycentre**, 2,131 km from Pluto's centre on 2026-01-01 (Horizons, 999 from
  500@9): far below a pixel. The inspector says so.
- **Keys and links:** `sbc:<SBDB SPK-ID>` like the comets (Pluto 20134340, Ceres 20000001), so a
  JPL lookup of one is drawn once. A link to one, or `focus=pluto` (any of the five names), asks
  for `/api/orrery-dwarfs` alone (`isDwarfFocus`) and waits for it.
- **Charon is left out** (see #99). Horizons covers it ("Charon (901)", plu060, 1800 to 2199, today
  included), so coverage is not the obstacle. Wiring is: the moon layer types a parent as a
  planet and places and sizes a moon from its parent's drawn planet radius (`moonLayer.ts`,
  `moonState.ts` drops any other parent), while Pluto is a px-clamped small-body marker with no
  radius; and moon spans ship in `/api/orrery-bodies`, which every visit loads.

## On-demand JPL (#100)

A visitor's search goes through one Durable Object, `JplQueue`, in its own Worker
(`workers/jpl-queue/`, deployed as `observatory-jpl-queue`). It reaches JPL only through it, one
request at a time, as JPL's Fair Use asks ("only one API request at a time"). `/api/planets`,
`/api/sentry` and `/api/fireball` still call JPL from their own Functions (cached, outside the
queue).

- **Why a separate Worker:** Pages can't host one. "You cannot create and deploy a Durable Object
  within a Pages project", and a Pages binding "require[s] the `script_name` key"
  (developers.cloudflare.com/pages/functions/wrangler-configuration, read 2026-11-07).
- **Free plan:** "Durable Objects are available both on Workers Free and Workers Paid plans", but
  on Free "Only Durable Objects with SQLite storage backend" (durable-objects/platform/pricing),
  hence `new_sqlite_classes`. Limits: 100,000 requests a day and 13,000 GB-s a day; duration is
  wall time at 128 MB, "shared across all requests active on an Object at once". One instance
  (`idFromName('jpl')`) awake all day is 11,059 GB-s, so it can't run out of duration.
- **The queue** (`queue.ts`): an explicit promise chain, because a Durable Object takes the next
  request while one awaits its fetch. 1 s between starts, 8 waiting at most (then 503 with
  `Retry-After`, `X-Queue: full`), 2,000 JPL requests a UTC day (`budget.ts`, one storage row a
  request; then 503 until midnight). `fetchJpl` allows only `ssd.jpl.nasa.gov` and
  `ssd-api.jpl.nasa.gov`, gives each attempt 15 s, and retries 503/429 twice (2 s, 5 s, or a
  `Retry-After` up to 10 s). `workers_dev` and preview URLs are off: only a binding reaches it.
  The DO answers 200 with JPL's status in `X-Jpl-Status`.
- **`/api/lookup?q=`** reads SBDB (`sstr=`): one object, a list (HTTP 300), or "not found".
  `parseLookupQuery` normalises the text (it is the cache key) and allows one trailing `*` after
  three characters. **`/api/trajectory?id=sb:<SPK-ID>&start=&end=&step=`** looks the SPK-ID up
  in SBDB (cached a week), asks Horizons for vectors (`DES=<SPK-ID>;` for an asteroid,
  `DES=<SPK-ID>;CAP;NOFRAG` for a comet, checked live 2026-11-07 on Eros, Apophis and 3I), checks
  the target name and the sample count, and caps a span at 600 samples between 1900 and 2100.
  Both cache a day with the Cache API.
- **The binding** is in `wrangler.toml` (`[[durable_objects.bindings]] name = "JPL_QUEUE"`,
  `class_name = "JplQueue"`, `script_name = "observatory-jpl-queue"`; the Worker was deployed
  first, 2026-11-07). Top-level bindings apply to previews and production alike. Without it both
  endpoints answer 503 `X-Error-Kind: upstream` plus `X-Not-Configured: jpl-queue`; the search
  card says lookup isn't available yet, and the health probe (a fixed 2026-01 span of Eros,
  cached, so most runs never reach JPL) only warns (`notConfiguredWarns`).
- **The search** (`SearchBox.tsx`): with no match among what the orrery carries, it offers
  "Search JPL for …". The card (`JplLookup.tsx`, its own lazy chunk) shows SBDB's answer and,
  from three daily Horizons samples around the sim date, the distance from the Sun and Earth
  (Earth from the planet tables) and the speed.
- **"Show in orrery" (#145) draws the object.** The card puts it in `lookupStore.ts`;
  `useLookupTrack.ts` asks `/api/trajectory` for two years around the sim date at 2-day steps
  (366 samples of the 600 allowed, `lookupSpan` in `src/lib/orrery/lookupTrack.ts`).
  - The span's centre moves on a 120-day grid, so the date is always ≥ 305 days from an end,
    everyone looking that season shares one cached answer, and a scrub of months asks for
    nothing. Past the span, the next one is asked for only once the clock has rested 1.2 s
    (`LOOKUP_SETTLE_MS`): a scrub across years sends one request, not one per span. The last span
    keeps drawing meanwhile (react-query `placeholderData`); the marker hides wherever no sample
    covers the date.
  - A busy queue's `Retry-After` is said in words ("Trying again in 20 s.") and honoured, 5–60 s;
    nothing else is retried. 404 reads "JPL has no object with this id".
  - `three/lookupLayer.ts`: one marker on the samples (Hermite, never extrapolated) in the Space
    objects lane colour (`LANES.space.emit`), apart from the amber approaches and cyan craft,
    joining the Earth frame within 0.1 au like the craft. Its line is the osculating ellipse
    through the state at the span's centre (`osculatingLoop`, shared with the moons, about the
    Sun's GM), so Halley shows its whole orbit from two sampled years; an unbound object
    (3I/ATLAS) draws its sampled path. The line is rebuilt only when the object or scale mode
    changes, and sits under the Orbits switch.
  - The inspector opens at once (`LookupFacts.tsx`: kind, orbit class, NEO/PHA, distances, light
    time, range rate, the samples' span and step, which line is drawn); the camera flies there
    once the samples cover the date. "Remove from orrery", on the card or in the inspector,
    clears it and closes its inspector.
  - Its key is `lookup:<SPK-ID>` in the scene, search ("Looked up at JPL") and links:
    `#orrery?focus=lookup:20099942` asks JPL on load and applies once the samples cover the
    link's date (or JPL says no for good). The canvas's `data-orrery-lookup` and `-lookup-path`
    let e2e check it (`e2e/orrery-lookup.spec.ts`).
- **No zod unions in client schemas.** `LookupResultSchema` is flat and narrowed by
  `readLookupResult`: a `z.discriminatedUnion`, the app's first, pulled zod's union code into the
  shared first-load chunk (150.3 kB against 149.8 kB).
- **Local run:** see [local-dev.md](../operations/local-dev.md#the-jpl-queue-locally).

## Provider registry (#91, #207)

Every provider the orrery spec named (#91, Part 1 and Phase 2), with where this repo stands with
it. Until #207 this table was `src/lib/orrery/sources.ts` and visitors saw all of it in the
orrery's Data sources list. Now that list shows only what the orrery fetches, with a plain
sentence and any credit the terms require
([ADR 0022](../decisions/0022-visitors-see-only-the-sources-the-orrery-uses.md)), and the
registry lives here. Terms and limits are from the 2026-11-06 fact-check unless dated otherwise.

**Status:** _registered_ known, not used; _implemented_ code exists but needs configuration;
_configured_ implemented with credentials set; _operational_ the site uses it; _unavailable_ the
documented endpoint does not exist. **Visitor list:** whether the orrery's Data sources list
shows it, and under which id.

| id          | Name                             | Org                    | Docs                                                          | API base                                            | Auth    | Provides                                                        | Status      | Terms                                                                             | Note                                                                                                                                                                                                | Issue | Optional | Visitor list |
| ----------- | -------------------------------- | ---------------------- | ------------------------------------------------------------- | --------------------------------------------------- | ------- | --------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- | -------- | ------------ |
| horizons    | JPL Horizons                     | NASA JPL               | https://ssd-api.jpl.nasa.gov/doc/horizons.html                | https://ssd.jpl.nasa.gov/api/horizons.api           | none    | Ephemerides: planets, moons, small bodies, spacecraft           | operational | JPL Fair Use: one request at a time, cache results                                | Sky tab planets; the orrery's 15 spacecraft, Earth and Moon (#93), sampled every 6 h by the refresh job; asteroid tracks in #92                                                                     |       |          | horizons     |
| celestrak   | CelesTrak GP                     | CelesTrak              | https://celestrak.org/NORAD/documentation/gp-data-formats.php | https://celestrak.org/NORAD/elements/gp.php         | none    | Satellite orbital elements (OMM/TLE)                            | operational |                                                                                   | ISS and satellites via the refresh job. No TLE for catalogue numbers 100000+ since 2026-07-11: OMM JSON for the catalogue (#98)                                                                     |       |          | celestrak    |
| space-track | Space-Track.org                  | US Space Force         | https://www.space-track.org/documentation                     | https://www.space-track.org/basicspacedata/query    | account | Catalogue, element history, decay and launch data               | operational | 30 requests/min, 300/h; redistribution of basic SSA data with citation            | The refresh job reads re-entry predictions every 6 h, and SATCAT, the Box Score and decays daily, with the owner's account, for /api/spacetrack (#101)                                              |       |          | space-track  |
| sbdb        | JPL Small-Body Database          | NASA JPL               | https://ssd-api.jpl.nasa.gov/doc/sbdb.html                    | https://ssd-api.jpl.nasa.gov/sbdb.api               | none    | Asteroid and comet orbits and physical data                     | operational |                                                                                   | On-demand search (/api/lookup, /api/trajectory) through the jpl-queue Worker. Was "implemented, waits on the Worker" until #207; production /api/lookup answered with `jpl-sbdb` data on 2026-11-11 | 100   |          | sbdb         |
| cad         | JPL Close Approach Data          | NASA JPL               | https://ssd-api.jpl.nasa.gov/doc/cad.html                     | https://ssd-api.jpl.nasa.gov/cad.api                | none    | Close approaches with 3-sigma distance range                    | operational |                                                                                   | The refresh job asks it every 6 h for /api/orrery-neo                                                                                                                                               | 92    |          | cad          |
| neows       | NASA NeoWs                       | NASA                   | https://api.nasa.gov/                                         | https://api.nasa.gov/neo/rest/v1/feed               | key     | Near-Earth objects: size, hazard flag, approaches               | operational |                                                                                   | Used elsewhere on the site (/api/neo), not by the orrery                                                                                                                                            |       |          | no           |
| scout       | JPL Scout                        | NASA JPL               | https://ssd-api.jpl.nasa.gov/doc/scout.html                   | https://ssd-api.jpl.nasa.gov/scout.api              | none    | Newly found objects with preliminary, uncertain orbits          | operational |                                                                                   | The refresh job asks it every 6 h for /api/orrery-neo                                                                                                                                               | 92    |          | scout        |
| sentry      | JPL Sentry                       | NASA JPL               | https://ssd-api.jpl.nasa.gov/doc/sentry.html                  | https://ssd-api.jpl.nasa.gov/sentry.api             | none    | Modelled impact probabilities (a model, not a prediction)       | operational |                                                                                   | Used elsewhere on the site (/api/sentry), not by the orrery                                                                                                                                         |       |          | no           |
| neocc       | ESA NEO Coordination Centre      | ESA                    | https://neo.ssa.esa.int/en/computer-access                    | https://neo.ssa.esa.int/                            | none    | Risk list and close approaches (flat files)                     | operational |                                                                                   | The refresh job reads it every 6 h for /api/orrery-neo; ESA says the interface may change without notice                                                                                            | 92    |          | neocc        |
| n2yo        | N2YO                             | N2YO                   | https://www.n2yo.com/api/                                     | https://api.n2yo.com/rest/v1/satellite/             | key     | Satellite positions and passes                                  | registered  | Per hour: positions 1,000, visual passes 100                                      | Not a live source: positions are computed locally; a one-off validation check only                                                                                                                  |       |          | no           |
| keeptrack   | KeepTrack API v4                 | KeepTrack              | https://api.keeptrack.space/v4/docs                           | https://api.keeptrack.space/v4                      | key     | Satellite catalogue and positions                               | registered  | CC BY-NC 4.0; 500/h, 5,000/day, 50/day for position calculations; scraping banned | Not a live source: positions are computed locally                                                                                                                                                   |       |          | no           |
| sscweb      | NASA SSCWeb                      | NASA GSFC              | https://sscweb.gsfc.nasa.gov/WebServices/REST/                | https://sscweb.gsfc.nasa.gov/WS/sscr/2/             | none    | Science spacecraft trajectories (incl. DSCOVR, ACE, SOHO, Wind) | registered  |                                                                                   | Horizons covers the same craft; a cross-check at most                                                                                                                                               |       |          | no           |
| spice       | NASA NAIF SPICE                  | NASA JPL               | https://naif.jpl.nasa.gov/naif/data.html                      | https://naif.jpl.nasa.gov/pub/naif/generic_kernels/ | none    | Ephemeris kernels and toolkit                                   | registered  |                                                                                   | Horizons serves the same SPICE data, so the app uses Horizons                                                                                                                                       |       |          | no           |
| discosweb   | ESA DISCOSweb                    | ESA                    | https://discosweb.esoc.esa.int/                               | https://discosweb.esoc.esa.int/api/                 | account | Object metadata: mass, size, launch, re-entry                   | operational | 100 requests per minute per token (its X-RateLimit headers, 2026-11-07)           | The refresh job reads mass, size and operator for the orrery craft and some satellites weekly, with the owner's token, for /api/discos (#101)                                                       |       |          | discosweb    |
| mpc-orb     | Minor Planet Center orbits       | IAU MPC                | https://docs.minorplanetcenter.net/mpc-ops-docs/apis/get-orb  | https://data.minorplanetcenter.net/api/get-orb      | none    | Asteroid and comet orbits with uncertainty                      | registered  |                                                                                   | GET with a JSON body (a query string returns 501); refresh job only                                                                                                                                 |       |          | no           |
| mpc-obs     | Minor Planet Center observations | IAU MPC                | https://docs.minorplanetcenter.net/mpc-ops-docs/apis/get-obs/ | https://data.minorplanetcenter.net/api/get-obs      | none    | Original astrometric observations                               | registered  |                                                                                   | GET with a JSON body; observations, never calculated positions                                                                                                                                      |       |          | no           |
| sb_ident    | JPL Small-Body Identification    | NASA JPL               | https://ssd-api.jpl.nasa.gov/doc/sb_ident.html                | https://ssd-api.jpl.nasa.gov/sb_ident.api           | none    | Known small bodies in a field of view                           | registered  |                                                                                   |                                                                                                                                                                                                     | 100   |          | no           |
| sb_obs      | JPL Small-Body Observability     | NASA JPL               | https://ssd-api.jpl.nasa.gov/doc/sb_obs.html                  | https://ssd-api.jpl.nasa.gov/sb_obs.api             | none    | Observable small bodies (as the spec described it)              | unavailable |                                                                                   | Does not exist: docs and API both 404 (checked 2026-11-06). Computed in-house instead (#99)                                                                                                         |       |          | no           |
| sbdb_query  | JPL SBDB Query                   | NASA JPL               | https://ssd-api.jpl.nasa.gov/doc/sbdb_query.html              | https://ssd-api.jpl.nasa.gov/sbdb_query.api         | none    | Catalogue-wide small-body search                                | operational |                                                                                   | The refresh job picks the brightest comets with it every 6 h for /api/orrery-smallbodies                                                                                                            | 99    |          | sbdb         |
| fireball    | JPL Fireball Data                | NASA JPL               | https://ssd-api.jpl.nasa.gov/doc/fireball.html                | https://ssd-api.jpl.nasa.gov/fireball.api           | none    | Historical atmospheric fireballs (events, not orbits)           | operational |                                                                                   | Used elsewhere on the site (/api/fireball), not by the orrery                                                                                                                                       |       |          | no           |
| satnogs     | SatNOGS DB                       | Libre Space Foundation | https://db.satnogs.org/api/schema/docs/                       | https://db.satnogs.org/api/                         | none    | Satellite identity and radio transmitters                       | registered  | CC BY-SA 4.0                                                                      |                                                                                                                                                                                                     |       | yes      | no           |
| ll2         | Launch Library 2                 | The Space Devs         | https://thespacedevs.com/llapi                                | https://ll.thespacedevs.com/2.3.0/                  | none    | Launches, vehicles, missions                                    | registered  | 15 unauthenticated requests/hour                                                  | The spec named 2.2.0; 2.3.0 is current. Launches here come from RocketLaunch.live                                                                                                                   |       | yes      | no           |

The visitor list also names four providers the spec's registry never held, all of them fetched by
the orrery (checked in #207):

| Visitor id | Name                    | What the orrery fetches                                       | Where in the code                                         |
| ---------- | ----------------------- | ------------------------------------------------------------- | --------------------------------------------------------- |
| suvi       | NOAA GOES SUVI          | The newest frame of the Sun, every 10 minutes                 | `src/components/orrery/three/sunImage.ts`                 |
| solar-wind | NOAA solar wind         | Solar wind speed at L1, through /api/solar-wind               | `useSolarWind` in `src/components/orrery/useNearEarth.ts` |
| enlil      | NOAA WSA-ENLIL          | The model's next Earth-directed CME arrival, through /api/cme | `useCme` in `src/components/orrery/useNearEarth.ts`       |
| dsn        | NASA Deep Space Network | Which craft the dishes are talking to, from eyes.nasa.gov     | `src/hooks/useDsn.ts`                                     |

**Credits on the list.** Space-Track's terms require "Space-Track.org" (ADR 0013), so the list
shows it. NOAA's data is public domain, per the #207 review's reading of
https://www.weather.gov/disclaimer. ESA's licence terms for NEOCC and DISCOSweb await ESA's reply
(#207). The attribution terms of JPL, CelesTrak and the DSN have not been checked. Add a credit
here and in `src/lib/orrery/sources.ts` when a provider's terms are found to require one.
