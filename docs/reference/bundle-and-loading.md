# Bundle and loading

How the first load is kept small and short, how lazy chunks are placed, what `check-bundle`
enforces, and what was measured. Decision on how far to go:
[ADR 0017](../decisions/0017-load-performance-floor.md).

## First-load budget (#75)

The `entry-gzip` budget is first-load JavaScript: the entry plus every chunk `index.html`
modulepreloads. Lazy-loading part of the app makes Vite split the code it shares with the entry
into a chunk the entry imports statically, so measuring the entry file alone under-reported by
about 40 kB. The console `Rest` panels (`*ConsoleRest.tsx`) and the SVG globe's land data
(`markers/landRings.ts`) load lazily. A new below-the-fold panel goes in a `Rest` file, not a
`Lead` one.

Budgets for lazy chunks are tripwires for accidental growth: a deliberate upgrade that pushes
one over raises it in the same commit, with the measured delta in the message. Only a rise in
`entry-gzip` is flagged to the owner, because it sets how fast the page appears
([ADR 0007](../decisions/0007-upgrade-dont-pin.md)).

## Chunking (#162)

Rolldown puts a module in the chunk named by the exact set of entries (the page plus every lazy
chunk) that import it (rolldown.rs/in-depth/automatic-code-splitting: "whether a module could be
put into the same common chunk is determined by if it is imported by the same entries"). A new
lazy chunk that reaches only part of what the page shares (JSX but no hook, `useState` alone)
gives that part its own set, so it leaves the shared chunk: `jsx-runtime-*` and `useQuery-*`
files appeared (#158, #159). (`JplLookup` did not split it; why was not checked.) Checked
2026-11-08 by adding a JSX-only stub chunk: 4 files became 5.

- **The fix is in `vite.config.ts`: two `codeSplitting` groups tagged `$initial`** (a module the
  entry imports statically, directly or not). `vendor` (priority 10, `node_modules`) takes the
  libraries, `app` takes our own code, whatever the lazy chunks use. The first load is
  `index`, `vendor` and a 599 B `rolldown-runtime` file (3 files; 150.6 kB gzip against 151.0 kB in
  4 files when the split landed, 151.9 kB on 2026-11-12), so a new lazy chunk can't split it. `tests/unit/vite-chunking.test.ts` pins the
  config. Library code now sits in `vendor`: an app-only edit (a dial label) left the `vendor`
  and `rolldown-runtime` file names unchanged, checked 2026-11-08.
- **Chains, not file counts, cost time (#155, #168).** The site is HTTP/2 (`nextHopProtocol`
  h2), which has no six-connection limit, so several first-load files download in parallel at
  little cost. What costs a round trip is a file found only after its parent runs. `check-bundle`
  fails `first-load-no-chain` when a file in the entry's static import graph is not in
  index.html's modulepreload list, and `first-load-files` above 8 files (printed every build).

## The orrery's code is requested together (#168)

`src/lib/orreryPrefetch.ts` has two paths.

- **Boot on `#orrery`** (`main.tsx`, before React renders) really imports OrreryPage and
  OrreryRenderer in parallel (Vite's preload list for the renderer brings three.js along);
  App.tsx's lazy page uses the same loader.
- **Pointer or focus on the Orrery dial tab, and 3 s after load once the browser is idle** (not
  for save-data or 2g) only inject `<link rel="modulepreload">` for the orrery's chunks, which
  downloads and compiles them without running them, so a phone does no main-thread work for a
  visitor who never opens the orrery.
- The vite.config.ts plugin `orreryPreloadManifest` writes the hashed file names to
  `orrery-preload.json`, which the helper fetches first. **It sits outside `/assets/` on purpose:
  `_headers` caches `/assets/*` as immutable, and an unhashed file there would go stale after a
  deploy.** The plugin fails the build if the OrreryPage/OrreryRenderer chunks are missing.
- `e2e/orrery-prefetch.spec.ts` checks that hovering the tab adds the links and mounts nothing.
- Keep orrery code out of `orreryPrefetch.ts`: it is in the first load.

### Measurements (2026-11-08)

- **One host** (Cloudflare previews of `92f840b`, of the #162 commit and of #168; cold, cache
  off, medians of 3, `perf3.mjs`). Production is a different host (first byte ~160 ms against
  ~135 ms), so it is not a baseline for a preview. First 3D frame: desktop 962 ms, 961 ms with
  #162 alone, 814 ms with #168 (runs 710-895 against 831-1149 before: noisy). Throttled phone
  (150 ms RTT, 1.6 Mbps, 4x CPU): 5912, 5809, 5640 ms. Earth FCP/LCP did not regress (phone 1732,
  1716, 1744 ms).
- **Waterfall:** on production the page started at 316 ms and the renderer and three.js at
  615 ms; on the #168 preview all three start together at 150 ms (desktop).
- **Why the phone gained little:** its waterfall (`waterfall3.mjs`) showed the orrery chunks
  starting at 1.54 s and three.js ending at 4.89 s, sharing the 1.6 Mbps link with
  `/api/orrery-bodies` (158 kB) and `/api/orrery-neo` (138 kB) and with Earth-view files a
  `#orrery` load never needed: `land-110m`, `EarthConsoleRest`, `/api/quakes`, `/api/eonet`, two
  more fonts. The cause was that the store started on `earth`; #167 fixed it (below).
- **Idle prefetch cost (phone profile, 12 s after load, long tasks, 3 runs each).** With
  `import()` on the idle path: 7073, 5819 and 3697 ms (median 5819). With modulepreload links:
  5718, 3960 and 3163 ms (median 3960, lower in each pairing). Run-to-run noise is large (the same
  build ranged 3.7-7.1 s), so treat it as a direction, not a size. Phone first 3D frame on a
  `#orrery` boot is 5422 ms (median of 3; boot is unchanged), desktop 715 ms.
- **Production after 151e622** (cold, cache off, medians of 3): desktop orrery first 3D frame
  0.81 s (1.40 s that morning), throttled phone 4.75 s (5.86 s), Earth page about 0.4 s desktop
  and 1.8 s phone. First load: 3 files, about 151 kB gzip.

## The first view comes from the hash before the first render (#167)

`useUiStore`'s initial `view` is `viewFromHash(location.hash)`. It used to start on `'earth'` and
fix itself in `useHashView`'s mount effect, so every direct `#orrery`, `#sun`, `#sky` or `#orbit`
load mounted the Earth columns for a render: EarthConsoleRest, propagate, and nine Earth feeds
were fetched for a page never shown. The globe's data hooks (`useGlobeData`) live in
`EarthColumns` (App.tsx), not in `App`, and the coastline chunk (`landRings`) loads on its first
call, not at module import, because that import sits in the entry.
The initial `layers` come from `layersFromHash` the same way (#176), and persist's `merge` lets a
`?layers=` link beat saved preferences: applied in the mount effect, the default layers mounted
for one render, and `#orbit?layers=fires` fetched `/api/aurora` for a layer the link turns off
(`tests/e2e/hash-layers.spec.ts`). No painted frame showed the defaults, so CLS was not affected.
`tests/e2e/orrery-lean-load.spec.ts` counts what a cold `#orrery` asks for. The orrery keeps
solar-wind, cme, dsn, spacetrack and discos (it shows them), and no Earth texture (#173,
below).

`#sun` and `#sky` draw no globe, so `useGlobeData` passes `enabled = false` to the globe's
feeds there (#172): the hooks still run, so the stage never remounts, but they fetch nothing
and `useIss` loads no SGP4 and runs no loop. Measured 2026-11-12 on a cold local build
(`tests/e2e/sun-sky-lean-load.spec.ts`): `#sun` dropped from 17 to 13 API paths (no ISS TLE,
launches, quakes or aurora; about 13.7 kB on production's wire) and from 17 to 15 scripts
(propagate and satellite.js, 11 kB gzip). `#sky` dropped from 16 to 14 API paths (launches and
quakes) and from 17 to 16 scripts (propagate); its Tonight panel still reads the ISS TLE, aurora
and satellite.js for passes. The ticker's feeds (eonet, fireball) are on every view.

## Earth textures (#85, #87)

They start with the page, small pair first. On screens 900px and wider only
(`EARLY_TEXTURES_MEDIA`), `main.tsx` calls `preloadTexturesAtBoot` before React renders, which
adds preload links for `day-2048.webp` and `night-2048.webp` when the view draws the globe
(Earth, Orbit). On a 4G phone the early 310 kB delayed the app's first paint by ~160 ms.

- **Why not static links in `index.html` (#173).** They were there until 2026-11-12, but the HTML
  can't see the hash, so a desktop `#orrery`, `#sun` or `#sky` downloaded 310 kB of Earth it
  never drew. A hash-checking inline script would need a CSP change (`script-src` allows no
  inline script). Measured locally (`vite preview`, 20 Mbps, 40 ms RTT, cache off, median of 5,
  tight runs): desktop `#orrery` to `data-orrery-mode="webgl"` 604 to 538 ms; desktop Earth to
  `data-globe-textures` 609 to 617 ms, since the textures now start after the entry runs. No
  API data locally, so production's contention with the orrery's ~300 kB of data is not in
  these numbers.

For the same reason there is no `Link` header for them,
which can't be limited by screen size, so they get no Early Hint. Narrower screens get the same
links from `preloadTextures` (`src/lib/texturePreload.ts`) when GlobeHost starts the renderer
import (#87): that is after first paint, and without it the pictures waited ~430 ms for the chunk
to finish. An SVG-only visitor never downloads them. Every tier draws 2048 first; only the high
tier then loads 4096 and swaps it in (`globeTextures` in `src/lib/globe3d.ts`, `upgradeTextures`
in `GlobeRenderer`). Never preload 4096: the tier is picked at runtime. The preloads carry
`crossorigin` because three's `TextureLoader` requests in CORS mode; drop either side and every
visitor downloads the file twice. `texture-preload.test.ts` and `texture-preload-dynamic.test.ts` pin all of this;
`orrery-lean-load.spec.ts` and `sun-sky-lean-load.spec.ts` check that no texture is fetched. The canvas's
`data-globe-textures` says which pair is drawn.

## Layout shift (#169)

A panel that fills in must already have its final room. Cold-load CLS measured 2026-11-08 on
1440x900 against production: Earth 0.07, `#sun` 0.41, `#sky` 0.15, `#orbit` 0.089 (real-visitor
desktop p75 0.244). Sources:

- `useLensSize` measured in a passive effect (after paint), so the globe grew and pushed the
  plates and footer down 200 px or more (now a layout effect);
- the voice line going from one line to two (`.voice` has a two-line `min-height`);
- each lead panel growing from its "Loading" box to its data (every lead panel passes
  `styles.reserve`, a `min-height` taken from a loaded panel at 380 px wide);
- the ISS plate widening with its first position;
- the ticker track shrinking from the empty state to its items.

**Fonts were not a source**: Special Elite, Fraunces and Plex 500 swap late, but nothing reflows
when they do, so they are deliberately not preloaded. A new lead panel needs a `reserve` class
too. `tests/e2e/layout-shift.spec.ts` replays `/` with staggered feed answers
(`feedFixtures.ts`, trimmed production data) and holds the sum under 0.01 (the shipped code
scored 0.044 and 0.019 there). Known leftover: the phone `#orrery` header moves 30 px at about
3 s (0.025). Real-visitor CLS is re-checked under #177.

The ticker's first fill waits for Space-Track (up to 3 s; with reduced motion, whose still
strip shows 8 items, until it answers or fails) so its re-entries lead the strip
(#101); after that it keeps items in arrival order, and it places its loop copy by a transform
(#175): a late feed joins the end of the strip instead of pushing the items already scrolling,
and the copy moves without a layout shift. The test holds the ticker's share at zero; it was
0.0095 at 1920 px with Space-Track answering after EONET.

## Real-visitor numbers

Cloudflare Web Analytics (RUM) through GraphQL: `rumWebVitalsEventsAdaptiveGroups` and
`rumPerformanceEventsAdaptiveGroups`, filtered on `requestHost:
"observatory.geektechlive.com"`, values in microseconds. The owner prefers Cloudflare's free tools
over Lighthouse.
