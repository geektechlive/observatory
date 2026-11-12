# Satellites, Space-Track and DISCOSweb

Thousands of satellites in the orrery's Earth frame, the satellite browser, and the facts read
from Space-Track.org and ESA DISCOSweb. Also SGP4 and satellite.js. Decisions:
[ADR 0011](../decisions/0011-sgp4-runs-in-javascript-under-the-csp.md),
[ADR 0012](../decisions/0012-satellites-live-in-the-earth-frame.md),
[ADR 0013](../decisions/0013-space-track-and-discosweb-on-their-terms.md),
[ADR 0024](../decisions/0024-starlink-elements-from-supgp.md).

## Satellites (#98)

They are CelesTrak OMM in nine disjoint KV groups, `celestrak:gp:<group>:v1`, drawn in the
orrery's Earth frame ([orrery-data.md](orrery-data.md#the-earth-frame-92-renderer-half)).
`scripts/celestrak-groups.mjs` runs in the refresh job: eight GP downloads (`CELESTRAK_FETCH`)
and then Starlink's supplemental GP, one at a time, 2 s apart.

- **Starlink is cut out of `active` by name**; its GP group is never downloaded on its own:
  CelesTrak's `starlink` group equalled the STARLINK-named objects in `active` (11,204 each,
  2026-11-07). `other` is whatever in `active` is in no named group, so it is stored only when
  every named group came back. Each object is stored once; the debris groups don't overlap
  `active`.
- **Starlink's elements come from CelesTrak SupGP where it has them (#209).**
  `sup-gp.php?FILE=starlink&FORMAT=json` carries elements CelesTrak fits to the ephemerides
  SpaceX publishes (every row `"DATA_SOURCE":"SpaceX-E"`, with an `RMS`), which are more
  accurate than the radar-based GP. `overlaySupplemental` (`satCatalog.ts`) replaces a GP row
  with the SupGP row of the same NORAD id (the newest epoch if SupGP lists one twice), puts the
  replaced rows first and stores their number as `supgpCount` in the Starlink body. SupGP
  objects that aren't in `active`'s Starlink slice are dropped, so no object lands in two groups.
  - **CelesTrak's usage policy** asks for SupGP no more than once per 2 h update; the job runs
    every 6 h and asks once. Like every CelesTrak request (below), it accepts only a 200 and is
    never retried. It is not asked at all when `active` gave no Starlink slice or any GP request
    in the same run failed. Its timeout is 60 s, capped by what is left of the job's deadline.
  - **A failed SupGP download is a warning, not an incident**: Starlink is stored on GP elements
    (`supgpCount: 0`). That overwrites the last SupGP copy for 6 h, until the next run; GP was
    what the orrery used before #209.
  - **Measured from the dry run of 2026-11-12 05:41 UTC (no KV write):** SupGP answered 5,106,473
    bytes, 11,195 records, all `SpaceX-E`, epochs 2026-11-10 17:13 to 2026-11-12 03:02 UTC. Every
    one matched a Starlink in `active` (11,195 of 11,195; none dropped). The whole step, nine
    requests with 2 s pauses, took 52 s. The stored Starlink body is 1,652,288 bytes, 476.9 kB at
    gzip -6, against 1,690,009 bytes and 550.0 kB for the GP body production served the same
    hour (SupGP's numbers carry fewer digits). Workers KV takes values up to 25 MiB
    (developers.cloudflare.com/kv/platform/limits, read 2026-11-12).
  - **Credit.** CelesTrak's SupGP and usage pages state no attribution terms, and SpaceX's
    manifest (`api.starlink.com/public-files/ephemerides/MANIFEST.txt`) states none in the part
    read. The orrery says where the elements come from anyway: the inspector's Source line for a
    SupGP object ("CelesTrak supplemental GP, fitted to SpaceX's published Starlink
    ephemerides"), the Starlink switch's hint, the Data sources list and the guide.
- **Rows, not OMM objects** (`src/lib/orbit/satCatalog.ts`, no imports, so the `.mjs` job
  imports it): `SAT_FIELDS` order, NORAD ids as strings (six-digit numbers since 2026-07:
  SARAMAGO is 100000). `rowToOmm` gives json2satrec what it reads.
- **The first CelesTrak request that isn't a 200 stops CelesTrak for the rest of the run
  (#212).** The usage policy says "M2M (machine-to-machine) software should immediately stop
  querying when it receives any non-HTTP 200 responses" and that ignoring this gets an address
  firewalled. Every CelesTrak request in a run (the ISS and satellite TLEs, the eight GP groups,
  SupGP) goes through one gate, `createCelestrakGate` in `celestrak-groups.mjs`: one try, a 200
  only, never retried. A non-200, or no answer at all (a network error or timeout), stops the
  gate, and the later requests fail at once without being sent ("not asked: CelesTrak stopped
  this run after …"). A 200 whose body won't parse fails only its own group. Each source that
  isn't refreshed keeps its KV copy and is judged by its age (36 h). The refresh job is the only
  CelesTrak caller: `/api/iss-tle` and `/api/satellites` read KV only and never fetch CelesTrak
  live (#214).
- **CelesTrak answers 403 "GP data has not updated since your last successful download"** when
  one address asks again inside its 2 h update cycle (seen 2026-11-07 after a local probe). It is
  a non-200, so it stops the run too, and the reason names it. Copies are read back only for
  failed groups, because Starlink's is 1.7 MB.
- Measured from 2026-11-07's data: 19,540 objects, 2.87 MB (938 kB gzip) across nine keys, so 36
  KV writes a day at four runs.
- `/api/orrery-sats?group=` streams one group (`_kvBody.ts`), allow-listed, 400 otherwise. The
  health check probes `stations`. Its contract (`health.ts`) also checks that a `supgpCount`,
  when present, is a whole number within the rows (#209). It is not in the Cache API
  (`_cache.ts`): `_kvBody.ts` serves it with `Cache-Control` only, and the SupGP body kept the
  same KV key because `supgpCount` is an optional field older clients drop.
- **The worker** (`sats.worker.ts`, logic in `satHandler.ts`): `fetchOrrerySatsBody` hands it the
  body undecoded, by transfer. It decodes it (`OrrerySatsSchema`, then each row by hand), and
  answers each frame with one JS `propagate` pass over every loaded group: ECI (TEME) km plus a
  status byte per object (`SAT_OK`, `SAT_FAILED`, `SAT_OUT_OF_WINDOW` past ±3 days of the
  object's epoch). Frames go back through `release()` and are written in place. `loadSatWorker`
  imports it on first use.
  - Names, NORAD ids, epochs and which objects carry SupGP elements (`supgp`, from the body's
    `supgpCount`, flagged before bad rows are dropped; #209) cross once per load or unload
    (`SatFieldInfo`); each frame
    carries only its field `version`. Sending 19,540 names with every pass cost the main thread a
    structured clone for nothing.
- check-bundle: `sat-worker-gzip` (40 kB; 35.7 kB measured since #137, 69.6 kB with the WASM
  path), `entry-has-no-sat-worker`, and `no-wasm` (no chunk may compile WebAssembly).
- **Main-thread code never imports `satField.ts` or the API client into the renderer.**
  - `satField.ts` brings satellite.js and zod. The status bytes live in the import-free
    `satStatus.ts`.
  - The page hands the renderer its `satSource`.
  - When satLayer imported either, the bundler split the client and zod out of the entry: five
    first-load chunks and +0.6 kB.
- **The drawing** (`three/satLayer.ts`): one geometry, two `Points` draws, crisp points and a
  soft haze.
  - The worker's buffers are the position attribute as they come, and the vertex shader does what
    `satScenePosition` does on the CPU: TEME to the scene's axes (`temeToScene`: obliquity of
    date, then back by the precession since J2000, 0.375° by 2026; nutation and the rest move a
    GEO satellite under 5 km), then the Earth frame's scale around Earth as drawn.
  - A new pass only swaps the attribute's array. The geometry is rebuilt only when the field
    changes, and it carries fixed bounds: three's transparent sort otherwise computed them from
    raw TEME, NaN included.
  - Earth's map turns with Greenwich (#138): `earthSkinToScene` turns the skin by sidereal
    time inside TEME, then by `temeToScene`, so the map and the satellites share one frame. The
    ISS's drawn point lands within 0.05° of satellite.js's sub-satellite point
    (`orrery-earth-meridian.test.ts`). Before, the map was about 75° of longitude off.
  - Colours by category from `SAT_CATEGORY_HEX`: stations bone, Starlink a quiet slate, debris
    dim. Cyan stays spacecraft-only and red hazard-only.
- **How they show** (`satDisplay` in `src/lib/orrery/satView.ts`) depends on the camera's
  distance from Earth in Earth radii as drawn, taken across the stage's narrow side
  (`satViewDistance`), so a phone matches a desktop.
  - Points at full strength to 35 R⊕, pickable, worker every second. They fade out by 80, with
    the worker every 2 s. Haze from 45, full by 90, gone by 300. Haze only above 60× playback.
  - Everything scales with the Earth frame's openness, so nothing shows or downloads while the
    frame is closed.
  - The plan's 12/40/150 were moved out: at the 30° field of view, the Earth orbit view needs
    about 31 R⊕ to hold the geostationary ring.
  - The haze blends normally, not additively: 19,000 additive points over Earth's disc made it
    white.
  - The haze's grain scales with the stage (`satHazePx`, #139): 7 px on a stage at least 700 px
    across its narrow side, shrinking in step below that, never under 2 px. At the Earth–Moon
    preset a 390 px phone's stage (356 px narrow side) sits at 62.8 R⊕, in the haze band, where
    the desktop (858 px) sits at 40.8 with no haze; 7 px grains drew a fat band through the
    asteroid labels. Now 3.6 px: the band's mean luminance over the arc above Earth fell from
    20.5 to 13.5 (p95 72 to 52), real GPU, 2026-11-12.
- **The controller** (`src/lib/orrery/satController.ts`, no three.js): fetches a group only when
  it is switched on and the frame is open, and unloads it when switched off.
  - Passes follow the cadence and never run while the clock stands still. A pass held back by the
    cadence wakes the renderer when it falls due.
  - A frame computed for an older field goes back to the worker. In the haze the last pass stays,
    refreshed only when the clock has moved 6 h from it.
  - A new field (a group loaded or unloaded, or a stale pass dropped) is passed at once, at the
    last tick's date, without waiting for a tick: Look closer detaches the orrery, which then
    draws and ticks nothing, and every position stayed null (#206). Until a pass covers the
    field, the inspector never says "No position at this date": it says "Working out its
    position…" while a pass is in flight, and "Position not available right now." when none is
    coming (the Earth frame was closed at the last tick, or the pass failed).
- **The Earth orbit preset** holds `ORBIT_PRESET_RADII` (7.2) around Earth.
  - OrbitControls' `minDistance` comes from `cameraMinDistance`: 2 frame Earth radii when the
    target is near Earth, 0.5 scene units elsewhere. The old fixed 0.5 held this view at 59 R⊕,
    where the satellites only faded.
- **Switches** (`satToggles.ts`, `SatControls.tsx`): one per kind, each explained, with the three
  debris clouds behind one.
  - Starlink and debris start off: Starlink is about 480 kB gzip on SupGP elements (550 kB on
    GP; measured 2026-11-12, #209) against about 300 kB for the rest switched on (2026-11-07).
  - The status line counts the objects CelesTrak hasn't updated in over 3 days, which are left
    out even today (105 of 5,669 on 2026-11-07). The stage notice waits until a quarter are
    hidden, once the clock has moved days away.
- **Picking, search and the inspector:** a tap picks the nearest point within 12 px, and only a
  satellite nearer than any body wins. The chosen one gets a marker, a label and a ring (#140):
  a bone band on a void backplate, held at `PX_CEILING.satSelect` (8 px) on screen, outside the
  marker's 4 to 6 px and inside the Sun's 10. Like the re-entry rings it skips the depth test,
  so on the far side of Earth it would draw over the near side as if the satellite were there
  (the ISS at 12.7N 64.7E drew over the Arctic in the 12:00 UTC Earth orbit view). Behind Earth
  (`behindEarth`), it and the re-entry rings draw at 0.25 opacity, the selection ring without its
  backplate. Before, the 4 px marker
  vanished among 19,000 points with every group on. `SatFacts` shows
  its group, height, how old its orbit data is and the source.
  - Search lists only the space stations: 19,000 entries would bury the rest. The ISS is listed
    before its group loads, and choosing it opens the Earth orbit view and switches the stations
    on. Everything else is found in the satellite browser, below.
- **SGP4 engine on the deployed site:** see [ADR 0011](../decisions/0011-sgp4-runs-in-javascript-under-the-csp.md).
  Our CSP's `script-src` has no `'wasm-unsafe-eval'`, so satellite.js's WASM `BulkPropagator`
  failed to compile in the worker ("violates the following Content Security policy directive")
  and the JS path ran. #137 removed the WASM path (2026-11-12): the worker runs JS everywhere,
  local preview included, and `data-sat-engine` always reads `js`.
  - **The JS path is the faster one.** Measured 2026-11-07 on this Mac, Chromium on the real GPU,
    all 19,540 objects: JS took 5–11 ms a pass on the orrery-98 preview, and WASM took 90–122 ms
    in local preview. No main-thread long tasks either way. The iPhone 15 Pro target is a pass of
    ≤ 300 ms and frames of ≤ 33 ms.
- Canvas data for e2e: `data-orrery-sat-mode` (points, fading, haze, hidden),
  `-sat-distance`, `-sat-total`, `-sat-drawn`, `-sat-hidden`, `-sat-groups`,
  `data-sat-propagate-ms`, `data-sat-engine`. `e2e/orrery-sats.spec.ts` mocks the groups with
  today's epoch (`satPayload.ts`).

## The satellite browser (#158)

"Browse satellites" in the Earth orbit controls (`SatBrowser.tsx`), for finding satellites
without a name. Not in the global search, on purpose.

- **Lists:** everything loaded; by kind (the switches' groups); by orbit; newest launches;
  biggest on radar; by owner country; re-entering soon (Space-Track TIP). Each has a one-line
  explanation. A text filter on name or NORAD number applies on top. About 100 rows
  (`DEFAULT_BROWSE_LIMIT`), then "N more, narrow it"; no virtualization.
- **What needs no download beyond the groups:** orbit class and launch order come from fields
  every stored row already has (mean motion and eccentricity; the COSPAR id's year and number).
  The worker computes them once per load (`orbitClass.ts`, `SatFieldInfo.orbit` and `.launch`),
  never per frame. The thresholds are a convention, not a standard: low from 11.25 rev/day, the
  geostationary ring 0.9 to 1.1 on a near circle, high for e of 0.25 or more or slower than that,
  medium between.
- **What needs SATCAT:** radar size and owner. SATCAT is 16 shards (`part=satcat&shard=`), fetched
  one at a time for the inspector, so these two lists ask for a one-tap "Load Space-Track's
  catalogue" (all 16 shards, `useAllSatcat.ts`) and never download on their own. The browser and
  the inspector share one query cache (`satcatShardQuery`, #161); the browser uses `client.query`
  because `useQueries` added 1.4 kB gzip to the orrery chunk. The note beside the button says
  "about 370 kB": the 16 shards measured on 2026-11-09 from production, 370 kB gzip in all, 22.5 to
  23.7 kB each, 2,171 to 2,260 rows each.
- **A group that is off** shows "Turn on <group> (about N kB)" from the measured gzip sizes in
  `satToggles.ts` (`downloadKb`, from `/api/orrery-sats` on 2026-11-07: Other active 291, the
  three debris clouds 139, the rest under 5; Starlink 477 kB from the SupGP dry run of
  2026-11-12, #209). Its count is unknown until it has
  loaded. Under every list a "Switched off" row offers the rest.
- **Re-entry rows** for objects not in the loaded field are listed, not hidden, and say why only
  as far as the browser can know. While any group is off or still loading (Starlink and the
  debris start off, and 2020-era Starlinks are among TIP's objects) the row reads "not in the
  groups switched on (may be in Starlink, which is off)"; only with every group on and loaded
  does it say "in no group the orrery carries" (`allGroupsLoaded`, `notDrawnReason`). The name is
  Space-Track's when it has one (`names`, empty until the daily 17:00 UTC run), else "NORAD
  <id>", which is not a name. SATCAT's object type (rocket body, debris) is not used to say "not
  stored"; add it when SATCAT is in KV.
- **The controls sheet clears the phone dial bar (#158).** On production (main) at 390 px the
  fixed dial bar (top 756 px) covered the last 80 px of the sheet even scrolled to the bottom
  (rail bottom 836, last group ending 827); the mobile `.rail` now has bottom padding of 108px
  (the bar's maximum height, App.module.css) plus a space-3. `orrery-sat-browser.spec` checks the
  gap.
- **Choosing a row** is `select(key)`: it switches on the toggle of the satellite's own group
  (`toggleForGroup`; it used to switch on stations only), flies to the Earth orbit view if the
  points are not pickable, and opens the inspector.
- **Filter cost:** `buildBrowseIndex` lowercases the names once per field version (2.8 ms for
  19,500). `browse()` alone, timed in Node under vitest on this Mac over a synthetic 19,500
  objects (200 runs each, `performance.now()`; the throwaway harness is not kept): a name filter
  took a median 0.28 ms (p95 0.45 ms), no match 0.14 ms, sorting all of them by launch 1.8 ms
  (p95 2.5 ms). That is the filter and sort, not React rendering the 100 rows, which was not
  timed.
- **It is its own lazy chunk (`SatBrowser-*.js`, 4.4 kB gzip; budget `sat-browser-gzip`),
  fetched when "Browse satellites" is first opened (#162).** #158 had folded it into OrreryPage
  because as a separate chunk the first load split from 4 files to 5; that was the placement rule
  in [bundle-and-loading.md](bundle-and-loading.md#chunking-162), now fixed at the root.
  OrreryPage went from 39.3 to 34.7 kB gzip with it out.

## Space-Track.org and ESA DISCOSweb (#101)

They are read with the owner's accounts, in the refresh job only.

- **Credentials:** GitHub Actions secrets `SPACETRACK_USER`, `SPACETRACK_PASS` and
  `DISCOSWEB_TOKEN`, passed to the refresh step (`ci-contract.test.ts` pins the env lines), plus
  a copy in the owner's local secrets file for dry runs. They go in the login form or the
  `Authorization` header and nowhere else: never a URL, an error, a log line, the payload or a
  fixture. Each step skips with a warning when its secret is absent.
- **Space-Track's "API Use Guidelines" (https://www.space-track.org/documentation, read
  2026-11-07) set the pace.**
  - "Limit API queries to less than 30 requests per 1 minute(s) and 300 requests per 1 hour(s)".
    `scripts/spacetrack.mjs` logs in once (`/ajaxauth/login`, a cookie session), asks 3 s apart
    inside a 90 s budget and the #128 deadline, then logs out.
  - TIP "1 / hour" at most: asked every run (`/DECAY_EPOCH/>now/INSERT_EPOCH/>now-14/`).
  - SATCAT, Box Score and Decay: "Once per day after 1700 (UTC)" (`dailyDue`). Only the 18:17
    run asks them. Decay uses "/MSG_EPOCH/%3Enow-1/", as the guidelines say.
  - GP_HISTORY: "1 / lifetime … Once you download an object's history, you need to store it on
    your own servers; do not download it again." `historyPlan` asks each completed month of
    `HISTORY_OBJECTS` (ISS and Hubble from 2016, Tiangong from 2021-05) once, six a run, newest
    first, and keeps one element set a week. Losing `spacetrack:history:v1` would mean asking
    again, so never delete it.
  - "Do not send hundreds of individual /class/gp/ or /class/satcat/ queries": SATCAT comes in
    one query of every current on-orbit object (`/CURRENT/Y/DECAY/null-val/predicates/…`).
  - Redistribution: "USSPACECOM has provided express blanket approval for
    transfer/redistribution of basic SSA data … conditioned on appropriate citation", where basic
    SSA data are "TLEs and OMMs; SATCAT; and Satellite Decay and Reentry Data". Every surface says
    "Space-Track.org". The Box Score is a count of SATCAT, credited the same way.
  - A dry run, or a manual refresh, after 17:00 UTC counts as that day's SATCAT, Box Score and
    Decay download.
- **Storage:** `spacetrack:catalog:v1` every run (TIP, 30 days of re-entries, Box Score, names),
  16 `spacetrack:satcat:v1:<n>` shards by NORAD id once a day (about 150 KB, 25 KB gzip each),
  `spacetrack:history:v1` only when it gains months. About 20 KV writes a day.
- **DISCOSweb** (`scripts/discos.mjs`, `src/lib/discos.ts`): JSON:API at
  `https://discosweb.esoc.esa.int/api/objects` with `DiscosWeb-Api-Version: 2`. Its answers
  carried `X-RateLimit-Limit: 100` with a reset about 60 s out (2026-11-07). The docs need a
  login. It asks for the 15 orrery craft by COSPAR id (`CRAFT_COSPAR`, each answer's name
  checked, the `DES=433` lesson) and, by NORAD number, the stations group, the GP_HISTORY objects
  and the predicted re-entries. Each object is asked again after a week, at most four requests a
  run, 3 s apart. One write, `discos:objects:v1`, when it changed.
- **Endpoints:** `/api/spacetrack?part=catalog|satcat&shard=0..15|history` and `/api/discos`,
  streamed through `_kvBody.ts`. Fresh for 36 h (catalogue), 72 h (shards), forever (history), 14
  days (DISCOS). Health contracts and check-health probes for the catalogue (a TIP list, which may
  be empty) and DISCOS (the craft).
- **Showing it:** the ticker's RE-ENTRY lines for this week's predictions; in the orrery, the Box
  Score and re-entry count under the Earth orbit switches, an amber ring on each predicted object
  that is loaded (`data-orrery-sat-reentries`), and the satellite inspector's kind, catalogued
  owner, launch, radar size (Space-Track's bands: "Small (< 0.1m), Medium (0.1m – 1m), & Large
  (>1m)") and DISCOS facts. Spacecraft get DISCOS's mass, size and operator.
- **Catalogued owner (#157):** SATCAT's COUNTRY, "the nation or group that has responsibility for
  an object" (Space-Track's glossary), shown as Space-Track gives it. It belongs to the catalogued
  object, so the ISS (25544, 1998-067A, Zarya) is CIS. `ownerNote()` in `satcatWords.ts` adds a
  note by NORAD id where that misleads; never remap the code.
- **The ticker costs the first load 0.9 kB gzip** (150.1 to 151.0 kB, still 4 chunks):
  `useSpaceTrack`, its schema and `spaceTrackText.ts`. A lazy import of the fetcher saved nothing
  and added a chunk.
- **Keep the orrery's Space-Track code out of modules the entry imports.** The SATCAT and DISCOS
  hooks (`useSatelliteFacts.ts`) and their words (`satcatWords.ts`) are orrery-only. When
  `src/lib/api/spaceTrack.ts` (in the entry, for the ticker) also exported a helper importing
  `src/lib/spacetrack.ts`, which the orrery chunk uses too, the bundler split five shared chunks
  out of the first load: 9 chunks and 152.6 kB, though the entry never called that helper.
- The first live dry run (2026-11-07 22:23 UTC, no KV write): Space-Track 7 requests in 23 s,
  SATCAT 35,526 objects, 5 TIP predictions; DISCOSweb 2 requests, all 15 craft matched.
  `tests/unit/fixtures/spacetrack` and `/discos` are its trimmed answers.

## satellite.js 7 (#97)

The multi-thread WASM build is stubbed out, and SGP4 loads on first use.

- **The stub.** v7's barrel (`export * from './wasm/index.js'`) puts its multi-thread WASM build
  in the module graph even though the app never calls it. That build uses top-level await, which
  caused both of the problems below.
  - **The old IIFE build error:** "Module format "iife" does not support top-level await" when
    building its pthread worker. This is why it sat on v5 until #97.
  - **The first-load split:** the page's first-load code went from 4 chunks to 18. That happened
    even with satellite.js lazy, and `worker.format: 'es'` alone fixed only the error.
  - The fix: `vite.config.ts` aliases `#wasm-multi-thread` to
    `src/lib/orbit/bulk/noMultiThread.ts`, a stub that throws. Our page sends no COOP/COEP
    headers, so the multi-thread runtime could never run here anyway.
- **SGP4 loads with the first orbit, not with the page.** `useIss` and `useSatellites` get the
  propagation module from `usePropagate` (`src/lib/orbit/loadPropagate.ts`), a cached dynamic
  import that starts once a TLE has arrived. The `propagate` chunk plus the satellite.js chunk
  come to about 11 kB gzip, and their download overlaps the TLE fetch.
  - Never import `@/lib/orbit/propagate` statically from first-load code. `check-bundle`'s
    `entry-has-no-sgp4` rule fails the gate if satellite.js reaches the first load, matching the
    minified `SatRecError` name `SemiLatusRectumBelowZero`.
  - First load measured: 159.6 kB on v5, 164.5 kB in 18 chunks on v7 with neither fix, 148.8 kB
    in 4 chunks after, and 150.6 kB in 3 files since #162.
- `propagate()` returns `null` when SGP4 fails (decayed, bad elements), and `satrec.error` says
  why.
- **Bulk SGP4 for #98** lives in `src/lib/orbit/bulk/`, inside a worker, as one JS `propagate`
  call per object. The #97 spike used `BulkPropagator` on the single-thread WASM runtime; #137
  removed it (the CSP blocks it, and JS was faster). An SGP4 error comes out as NaN.
- **The stub is still needed without our WASM code** (checked 2026-11-12, #137): every
  satellite.js import reaches the barrel, whose `wasm/runtimes/index.js` dynamically imports
  `#wasm-multi-thread`. With the alias removed, `vite build` fails again with the IIFE
  top-level-await error while bundling the worker.
- `passes.ts` uses v7's `shadowFraction`/`sunPos` cone, which matched our old cylinder test on
  all 25,920 ISS samples over 3 days. `tonight.ts` keeps its own Sun (agreement 0.0011°).
  `tests/unit/sat7-compare.test.ts` holds both claims.
