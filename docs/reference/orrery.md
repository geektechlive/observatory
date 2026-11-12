# The orrery page

The full-page 3D solar system: its shell, renderer, framing, labels, playback, links, guide,
imagery and spacecraft models. Data sources are in [orrery-data.md](orrery-data.md), satellites
in [satellites.md](satellites.md), loading and bundle budgets in
[bundle-and-loading.md](bundle-and-loading.md). Decision:
[ADR 0008](../decisions/0008-the-orrery-is-a-whole-page.md).

## A whole page, not a lens (#91)

`view === 'orrery'` renders a lazy `OrreryPage` instead of the lens and console columns. The
ticker and footer step aside, and `.page[data-view='orrery']` zeroes `--ticker-h` so the phone
dial bar sits on the bottom edge. `CONSOLE_PARTS` and `ConsoleVoice` take `ConsoleColumnView`;
the orrery writes its own voice line inside its chunk, from the planet math.

- **Its renderer** (`src/components/orrery/three/OrreryRenderer.ts`) has its own WebGL context,
  created once for the page's lifetime like the globe's. It draws on demand.
- **`schedule()` is the only place a frame is requested, and the loop stops when nothing
  moves.** `frame()` once called `requestAnimationFrame` itself while OrbitControls' `change`
  event had already scheduled a frame. Every camera move doubled the loop, and a 1x clock kept
  them all alive.
  - The result: the owner saw the page slow down with use. A soak of 30 preset and drag cycles
    left 12,361 pending callbacks and 3 million draws; after the fix it holds steady at 1–2
    callbacks and about 1,600 draws.
  - A 1x clock now wakes the renderer once a second with a timer.
  - `e2e/orrery-soak.spec.ts` guards it, through the canvas's `data-orrery-animating`,
    `-draws`, `-geometries` and `-programs`, and the page's `data-orrery-renders`.
- **It reads the clock through an injected `ClockReader`, never the zustand store.** When it
  imported the store (and so React), the first load split from 4 chunks into 7.
- **Planets** come from `src/lib/orrery`: JPL Table 1 inside 1800–2050 and Table 2 (3000 BC –
  3000 AD) outside it. `heliocentric().table` says which.
- **Presets are fitted numerically** (`three/framing.ts`): the camera distance is bisected until
  the preset's edge orbit fills 88% of the view at the stage's aspect. Inner's edge is Mars's
  aphelion, Outer's Neptune's, Heliosphere's 200 au.
  - `place3d` bends at 3 au, not 0.1 au. At 0.1 au Jupiter sat only 1.4x Mars's radius, so the
    Inner view could not hold Mars without Jupiter crossing the stage's corners.
  - `orrery-framing.test.ts` checks what each preset shows. The canvas's `data-orrery-onscreen`
    lets e2e check it in a browser.
- **Bodies have a minimum on-screen size** (`MIN_PX`), so the scene radii stay small and inside
  their orbits.
- **Labels** follow `labelOrder`: selected body, then the voice line's subject, then Sun, then
  Earth. A colliding label stacks above or below with a hairline; the voice subject is never
  hidden.
  - Since #92: labels on one line keep a 10 px gap ("Mars Venus" read as one phrase), every
    label keeps off other bodies' dots but never its own ("Sun" sat on Saturn's), and a label
    that would run off the stage's right edge goes to the left of its body (`side: 'left'`, the
    leader moves too).
  - Earth, the Sun and the selected body are home labels (`priority`): they try farther rungs
    (±54, ±72 px), then sit over a dot, rather than hide. The dot rule alone hid Earth's label in
    the default Heliosphere view.
  - Layout uses a shown label's measured width (`widthPx`); the 7 px a character estimate ran
    about 8% short.
- **The inspector's footprint** is passed to `setViewInset`, which shifts the projection window
  so the focused body sits in the free part of the stage.
- **Bundle rules:** `entry-has-no-orrery` (markers `data-orrery-page`, `orreryWebgl`) and
  `orrery-gzip` (each orrery chunk, 34 kB since #98, 40 kB since #158, 38 kB since #162, when
  the satellite browser left OrreryPage: 34.7 and 24.4 kB measured).
- **Five dial tabs** don't fit the 641–899 px bar with their sub-lines, so `.nodeSub` hides
  below 900 px.

## Playback (#114)

It runs to a year a second (`PLAYBACK_RATES`: 1×, min, h, day, week, 30 days and 365 days a
second). The clock clamps to Table 2's window (`SIM_MIN_MS`/`SIM_MAX_MS`) and the time bar
pauses on its edge. The scrubber's ±1-year window moves to the clock once it leaves it
(`scrubCentre`). Craft and moons that leave their data at speed are counted in a stage notice
(`noDataNotice`) instead of vanishing silently. `e2e/orrery-playback.spec.ts` holds the
year-a-second rate and a 10-second soak.

## Shareable links (#108)

`#orrery?t=<ISO UTC>&focus=<key>&preset=<id>`. Same `?` form as `#earth?layers=`. The format
lives in `src/components/orrery/orreryLink.ts` (no three.js), and the hook in
`useOrreryLink.ts`.

- `t` is written to the second and clamped to `SIM_MIN_MS`/`SIM_MAX_MS`; a bare date means
  midnight UTC. A link with `t` opens paused, pausing before setting (the #121 lesson). `t` is
  left out while the clock runs at 1× within a minute of now.
- `focus` is the catalog key: `Sun` and the planets by name, craft and moons `naif:<id>`, close
  approaches `sb:<number or designation>`, `L1`. The colon stays unencoded. Reading also accepts a
  name, ignoring case, with `-` or `_` for spaces (`focus=voyager-1`). With both a focus and a
  preset, the camera is on the preset and the inspector open on the focus, since choosing a
  preset keeps the selection: the link selects first, then applies the preset. An unknown focus
  is dropped once the bodies have arrived and the close approaches have answered (`settled`). A
  failed bodies fetch is not settled: the link waits for the next fetch rather than losing its
  focus (seen once on the preview: the focus vanished, and a failed fetch reproduces it).
- **A satellite is `focus=sat:<NORAD id>`** (#158; the scene key, so choosing one already writes
  it; six-digit ids exist). It is found among the loaded groups, not the catalog: the link opens
  the Earth orbit view (groups only load with the frame open), waits for the switched-on groups
  to load, switches every group on once if it is not among them (Starlink and the debris start
  off; about 660 kB gzip together, 522 + 139 kB measured), and when it has found the satellite or
  given up puts the switches back as they were, keeping the found satellite's own group on
  (`satLinkStep` in `satLink.ts`, `restore` in the page). An unknown focus is dropped once those
  have settled too. The Earth orbit view the link opens is not counted as the visitor replacing
  it. While a link waits, the visitor selecting or choosing a preset replaces it, because the
  apply step clears the link before it selects.
- Writes are `replaceState` only: on a selection or preset change, and 400 ms after the clock
  last changed, so a scrub writes once. Nothing is written while a link is still being applied.
- **`buildHash` keeps the orrery's own params when the hash is already on the orrery** (raw, so
  the encoding stays) and drops everything else. Without that, `useHashView`'s mount
  canonicalisation wiped the link before the lazy page could read it. `layers=` never reaches the
  orrery (#109).
- `e2e/orrery-link.spec.ts` checks Voyager 1 on 2012-08-25, a scrub with history unchanged,
  presets including Earth–Moon, and Earth layer links surviving a trip to the orrery.

## The guide (#159)

It teaches by doing: a lazy drawer of lessons, a glossary, and "what's this?" terms in the
inspector. A Guide button (in the rail, beside Controls on a phone) and a first-visit "New
here?" chip open `guide/OrreryGuide.tsx`. Decision:
[ADR 0014](../decisions/0014-the-guide-teaches-through-links.md).

- **Show me is a link.** `useOrreryLink` returns `applyLink(link, { fresh: true })`, the path
  the address takes on load and on edit. Nothing sets `location.hash`: an address equal to the
  current one fires no `hashchange`, and the camera is not part of a link, so a second press must
  still move it (`e2e` "Show me works again"). `fresh` returns the clock to now when the link has
  no `t` and clears the selection when it has no focus; an address you paste does neither.
- **A lesson carries a fixed `t` only where its data lasts** (`guide/lessons.ts`). Voyager 1 on
  2012-08-25, Mars at opposition 2025-01-16, 'Oumuamua at perihelion 2017-09-09 12:00 UTC (SBDB
  `tp` JD 2458006.007 TDB; reached only as `lookup:50788063` through the JPL queue). The moons
  (±15 days of data), L1 and the Earth frame (Horizons' Earth, ±30), satellites (±3 days of
  epoch) and the asteroid payload (rolling ±30) exist only near today, so those lessons carry
  none. "The closest asteroid pass" is resolved from `/api/orrery-neo` when the guide renders
  (`closestApproach`, placed objects only) and opens on the moment of the pass, so no `sb:` key
  is hard-coded.
- **Mars is a heliocentric view, so no loop is drawn.** Retrograde ran 7 Dec 2024 to 24 Feb 2025
  (79 days, 19.2 degrees: JPL Horizons observer table, geocentre, queried 2026-11-07);
  `src/lib/orrery/retrograde.ts` finds the same turning points from the orrery's own planet maths
  within 3 days (`orrery-guide-facts.test.ts`). The lesson says what the scene does show: Earth
  overtaking Mars.
- **The drawer collapses to a bar while a lesson shows**, because the inspector opens in the same
  right-hand slot (on a phone, the bottom sheet) and the camera's view inset only knows about the
  inspector. The inspector moves below the bar (`.stage[data-guide='compact']`); on a phone the
  bar is one row, the sheet shorter and the notices hidden.
- **`OrreryGuide` calls `useOrreryNeo()` itself and takes no data props.** This was once
  load-bearing: a lazy chunk that reached `react` but not react-dom, react-query or zustand split
  `react`/`jsx-runtime` out of the `client` chunk into a fifth first-load file. Since #162 the
  `vendor`/`app` groups ([bundle-and-loading.md](bundle-and-loading.md#chunking-162)) make that
  impossible, so it is only a design choice now.
- **Bundle rules:** `entry-has-no-guide`, `orrery-page-has-no-guide` (the marker is
  `data-guide-drawer`), `orrery-guide-found` (fails if a rename drops the chunk, so the budget
  can't switch off silently) and `orrery-guide-gzip` (12 kB; 8.7 kB measured). `OrreryPage` rose
  from 33.5 to 34.7 kB (chip, term buttons, wiring), inside the shared `orrery-gzip` budget (38 kB since #162).
- **One glossary, `src/lib/orrery/glossary.ts`, with a source on every entry.** The guide prints
  it; `Term.tsx` (dotted underline, a button) fetches it on the first press, so the inspector
  pays nothing for it. `orrery-guide-facts.test.ts` checks the quoted arithmetic (light time per
  au, the geostationary radius from Kepler's third law, the Moon's distance in Earth radii).
- **First visit:** `guideHint.ts` keeps `observatory.orrery.guide.v1` in localStorage inside
  try/catch (even the `localStorage` getter can throw) with an in-memory fallback. The chip is a
  `role="note"`, never a modal, and opening the guide retires it.
- "Finding things" names the satellite browser (#158). When a control the guide explains
  changes, update its section in `guide/sections.ts` in the same change.

## Imagery (#105)

Real maps on the planets, the live Sun from GOES SUVI.

- **What each body shows, and how honest it is, lives in `src/lib/orrery/imagery.ts`:** the kind
  of colour (true, enhanced, simulated, shaded, observed), a note, the mission and the credit.
  The inspector prints all of it (`ImageryFacts.tsx`). Mercury is MESSENGER enhanced colour, Mars
  a colourised Viking mosaic, Jupiter Cassini PIA07782, Earth the globe's own `day-2048.webp`.
  Saturn, its rings and Neptune are Björn Jónsson's maps, credited by name as his terms ask
  ("please mention their origin") and linked to his maps page (`creditUrl`). His terms also ask
  that copies not be placed on other sites; they are used only as downscaled textures inside the
  scene, never offered as maps ([ADR 0019](../decisions/0019-jonsson-maps-as-in-scene-textures.md),
  #180). Don't add a download or a map page for them. Venus and Uranus get no map: they are
  shaded in their palette colours.
- **Maps load on first need, never with the page.** `BodySkins` gives each planet a lit, mapped
  twin, tilted to its IAU pole and spun at its sidereal period (NASA fact sheet). It takes over
  from the flat dot only once the body is in view and at least `SKIN_MIN_PX` (6 px) in radius,
  and its map downloads then. The Inner view fetches none. The canvas's `data-orrery-skins` lists
  the mapped bodies.
  - The poles are tested against the fact-sheet obliquities. Mars uses the IAU 2009 mean pole,
    because the 2015 constant needs its periodic terms (1.3° off without them).
  - The spin rate is real; the phase is not, since no prime meridian is fitted.
  - **Focusing a planet approaches its lit side (#116, `sunlitFocusDirection` in
    `framing.ts`).** Focus used to keep the camera's old direction, so Jupiter drew from its
    night side at half its map's brightness (disc luminance 73 against the map's 152; now 140).
    The texture was never the problem: it matches PIA07782 to within 0.3 of a level. The camera
    turns to at most `MAX_FOCUS_PHASE_DEG` (35°), or to the smallest phase at which the Sun's
    drawn corona stays off the planet. Mercury's focus distance is longer than its distance from
    the Sun, so it is framed from beside the Sun, about half lit.
- **The live Sun: the newest frame from NOAA's `suvi-primary-171.json`,** taken from its file
  name with the exposure window. It is loaded straight from NOAA, which sends
  `access-control-allow-origin: *`. `services.swpc.noaa.gov` is in both `img-src` and
  `connect-src`, and `orrery-suvi.test.ts` checks them, because dev ignores `_headers`.
  - It refreshes every 10 minutes while the orrery is attached. Any failure before the first
    frame leaves the flat disc, and the inspector says why. The canvas's `data-orrery-sun` is
    `live` or `fallback`.
  - The frame is cropped to a square with the caption dropped, and its corona fades to black in a
    circle (`fadeCorona`). It is drawn on a sprite lifted just in front of a depth-only sphere.
  - The sprite blends additively but leaves the canvas's alpha alone. Plain `AdditiveBlending`
    wrote an opaque black square into the transparent canvas.
- **Orrery e2e answer NOAA themselves** (`tests/e2e/swpc.ts`), so they never wait on it.
- **`check-bundle` rules:** each map is under `textureBytes`, all of them together are under
  `planetTextureTotal` (486 kB of 700 kB), and `index.html` must never name one
  (`entry-has-no-planet-textures`).

## Spacecraft shapes (#115)

A silhouette at a distance, a 3D model when focused.

- **Silhouettes** (`three/craftSilhouettes.ts`) are our own SVG path data, drawn with `Path2D` in
  spacecraft cyan, a fixed `CRAFT_ICON_PX` (18) at any distance. Never an agency logo or
  insignia: NASA's are "not in the public domain".
- **What each craft is drawn as** lives in `src/lib/orrery/craftModels.ts`: a NASA model file
  with its credit (the Source line of its science.nasa.gov page) and page link, or a simplified
  model built in code (`three/craftStandIns.ts`). Psyche and Lucy have no published model.
  BepiColombo and Solar Orbiter are simplified until ESA answers on the Sci-Fleet licence (asked
  2026-11-07, #115). Each entry also names the model-frame `axis` that points along its attitude
  (Voyager's dish to Earth, Parker's and JWST's shields to the Sun), read from renders along +X,
  +Y and +Z.
- **The models are built by `scripts/craft-models.mjs`** from NASA 3D Resources downloads
  (`node scripts/craft-models.mjs <dir>`). Draco is decoded at build time and never shipped:
  Draco and meshopt need a WebAssembly decoder, and the CSP allows no WebAssembly compile.
  Per-face normals are dropped so the meshes weld and simplify (the models draw flat-shaded),
  then quantized, with WebP textures. Ten files, 110-426 kB, 2.16 MB in all. Europa Clipper's
  official 35.7 MB file loses its textures and its sub-pixel components (`simplifyPrune`). New
  Horizons is assembled from NASA's 3D-printing parts, credited as approximate.
- **One descriptor and a gate for every model (#202).** The layer takes a `ModelDescriptor`
  (`src/lib/orrery/modelDescriptor.ts`): spacecraft resolve by NAIF id, satellites by NORAD id and
  then family (that table is still empty: shared stand-ins, such as one TDRS model for its
  generation, are filed by NORAD id with `scope: 'family'`). `loadModel` (`three/craftModelLoad.ts`) loads, centres and
  fits one, with an `AbortSignal` and a `dispose`, for any view. Every shipped file needs a
  complete entry in `scripts/craft-manifest.mjs`; see
  [satellite-models.md](satellite-models.md#the-asset-gate).
- **Only the focused craft has a model** (`three/craftModelLayer.ts`). It is fetched on focus
  (GLTFLoader is its own chunk), disposed when the focus moves, sized by its body, not its booms
  (`craftModelFit.ts`), and seen three-quarter on (`threeQuarterView`). The canvas's
  `data-orrery-model` reads `loading:`, `model:`, `simplified:` or `failed:<naif>`.
- **The model is never bigger on screen than the Sun (#204).** Its radius is
  `craftModelPx(sunPx)` (`three/pxClamp.ts`): 0.9 of the Sun's drawn radius, held between the
  craft icon's radius (9 px) and 100 px. The renderer takes the Sun's projected radius each
  frame, on screen or not, and passes it to `CraftModelLayer.place`. The test probe
  `data-orrery-px` reports it as `model` (px, or null when none is drawn). Look closer shows the
  model full size, unaffected by this rule.
- **`check-bundle` rules:** `craft-model-bytes` (850 kB each), `craft-model-total` (8.5 MB, sized for all of tier A; see satellite-models.md),
  `entry-has-no-craft-models`, `gltf-loader-gzip` (30 kB; 13.5 kB measured).

## The detail view, "Look closer" (#203)

A button in the inspector, for a spacecraft or satellite with a model, opens the model close up
(ADR 0021).

- **Its own canvas and renderer.** `DetailView.tsx` (a lazy chunk, `DetailView-*.js`) mounts only
  while `detail` is set in `store/orreryView.ts`. `three/DetailScene.ts` makes the canvas, a
  `WebGLRenderer`, two lights and an `OrbitControls` (damping, no panning). Frames are on demand: a camera change, damping still settling, a resize or
  a new model asks for one; nothing runs otherwise. It creates its own canvas, so a canvas whose
  context was force-lost is never reused.
- **Framing is by the model's real outline (#205), not the body radius.** `fitModel` leaves booms
  and arrays out on purpose, which suits the orrery's small model (`CraftModelLayer`, #204) but
  cropped big models here. `setModel` collects every vertex of every mesh and
  `outlineFraming` (`src/lib/orrery/detailFraming.ts`, pure, unit-tested) fits them as seen from
  the start direction: the look-at point is balanced so the outline sits in the middle of the
  canvas (perspective makes the near side larger, so the middle of the box is not the middle of
  the picture), and the distance makes the outline fill the limiting dimension to 1 over 1.08,
  an 8% margin, perspective included. The model is moved so that point is the origin. A bounding
  sphere (first version) was safe from any side but left a long model filling under half the
  canvas. The zoom limits are 0.36 times that distance in, and out to at least 3.3 times it and
  to where the whole bounding sphere is in view, so the whole model is reachable from any side.
  **The closest approach never enters the bounding sphere:** `minDistance` is at least 1.1 radii
  (and the fitting distance at least 1.2), so at full zoom the whole model is in front of the
  camera and nothing flips behind it; `camera.near` is set per refit to 0.05 radii (the nearest
  vertex is then at least 0.1 radii away) with `far` at the zoom-out limit, a ratio of a few
  hundred. Raising `minDistance` was chosen over shrinking `near` for a camera inside the sphere,
  because a camera inside the model drops parts behind it and flips their projection. A long
  model therefore zooms in less far than 0.36 of the fit. Non-finite vertices are skipped. A
  resize refits: the camera keeps its share of the new fitting distance. `fitModel` is
  unchanged for the orrery.
- **The orrery steps aside.** One effect in `OrreryPage.tsx` owns `attach` and `detach`: it
  detaches while the view is open (loop, tick and Sun image stop, canvas leaves the page, scene
  kept) and resizes and re-attaches on close. Nothing else attaches. `schedule()` is still the
  only place the orrery requests a frame.
- **Closing disposes everything.** Unmount aborts a load in flight, and the scene removes its
  listeners, then disposes the controls, the model (`PreparedModel.dispose`) and the renderer, then
  calls `forceContextLoss()`. A context lost while the view is open closes it.
- **Layout: three bands, nothing under the text (#205).** `.detailView` is a grid: a top bar
  (title, zoom buttons, Back to orrery), the model's canvas (`minmax(160px, 1fr)`), and the credit
  band. The canvas is its own row, so the model never draws under the credit (a licence term, #179),
  the title or the controls. The column is `minmax(0, 1fr)` so a long credit wraps rather than
  widening the stage. Padding by `--inspector-right` and `--inspector-bottom` keeps all three
  clear of the inspector, so the credit also stays above the phone sheet. Under 900px the bar and
  credit are tighter, and the sheet folds (next item).
- **The phone sheet folds to a header row, with a "Facts" toggle (#205).** At 899 px and under,
  while the view is open, the inspector collapses to its header row (the name, a Facts button with
  `aria-expanded`, and Close) and the model gets the rest: 280 px or more at 390 x 844 (the e2e
  asserts it). Facts opens the usual sheet, capped at 40% of the stage and scrolling inside, and
  folding it gives the room back. It opens folded each time the view opens: `OrreryPage` keeps
  `factsOpen` and resets it when `detailOpen` changes, then passes `Inspector` a `facts` prop only
  while the view is open (so the button and `data-facts` exist only then). The folded facts are
  `display: none`, out of the tab order; the sheet's size change reaches `--inspector-bottom`
  through the existing ResizeObserver on the panel, so the bands follow. Everything under the
  header row sits in one `inspectorBody` div, and the Facts button's `aria-controls` points at
  its id. The Facts button shows
  only under 900 px; wide screens are unchanged (the e2e asserts no button there). Closing the
  view (Back or Escape) returns the sheet and focus to Look closer. The guide's Look closer line
  (`guide/sections.ts`) says it.
- **What it shows.** The inspector stays on top of the view as the facts column (right on wide
  screens, a bottom sheet under 900px, folded as above and at most about 40% of the stage when
  expanded); the page passes its size as `--inspector-right` and
  `--inspector-bottom` on the stage. The view adds the model, a credit line from the descriptor, a
  note when the model is a stand-in (`kind: 'standin'` or `scope: 'family'`), the "Back to orrery"
  button, and Escape. The credit reads "Model: credit, licence, Source" for a NASA model. A
  descriptor with `licenceUrl` or `changes` (CC BY, #194) reads "Model: credit (source),
  licence (licence). Changes." with both links, and `changes` is "Simplified for this site."
  Models ship uncompressed, so never write "compressed". Focus goes to Back to orrery on open and
  returns to "Look closer" only after Back to orrery or Escape. A failed load keeps the view open
  with "Model unavailable" (an alert) and Retry, which moves focus to the model.
- **Keyboard and touch.** The model is a focusable group: arrow keys turn it about its centre,
  plus and minus zoom within the controls' limits, and two zoom buttons give a single-pointer
  way to zoom. `DetailScene` exposes `rotate` and `zoom`, each asking for a frame.
- **Escape.** Bubble phase on `window`, skipped when the event was handled (a Term popover stops
  it), came from an input or the Find combobox, or the guide is open: those dismiss first and a
  second press closes the view.
- **The chunk.** `useDetailViewModule` imports `DetailView` on first open. If the fetch fails
  the page closes the view (the orrery re-attaches, never left detached). While it loads,
  `DetailLoading` (a status, marked `data-detail-loading`) stands in and Escape leaves it.
- **Which objects.** `modelForKey` (`modelDescriptor.ts`): `naif:<id>` through
  `spacecraftDescriptor`, `sat:<norad>` through `modelForSatellite`. The renderer has no
  satellite family field yet, so only an object's own entry can match; both tables are empty
  until #194. A link with `detail=1` to an object with no model opens the focus alone.
- **Probes for tests.** The page root carries `data-orrery-detail-scenes`, `-models` and
  `-opened` (live scenes, live models, scenes ever made), `-leaked` and `-leaked-textures`
  (what the renderer still held after each model's dispose; must stay 0), the detail canvas
  `data-detail-geometries`, `-textures`, `-camera` (azimuth, polar angle, distance) and `-fit`
  (the projected outline of every vertex, in CSS px from the canvas's top left,
  "minX,minY,maxX,maxY"; a box's corners would overstate it). `-fit` is opt in, and with it `-nearest` (how far in front of the camera the nearest vertex is; the
  e2e asserts it stays positive at full zoom): it walks every
  vertex, so the scene writes it only when the canvas already carries `data-detail-fit` (the e2e
  adds it with an init script that watches for the canvas), as with `data-orrery-px`.
  `tests/e2e/orrery-detail-framing.spec.ts` asserts it lies inside the canvas at the default view
  and the zoom-out limit, fills at least 80% of the limiting dimension at the default view, and
  that the canvas is clear of the credit, title and controls), and the
  orrery canvas `data-orrery-inset` (right, bottom, top). The renderer keeps one texture of its
  own, so a count of 1 with no model is normal.
- **`check-bundle` rules:** `orrery-detail-gzip`, `orrery-detail-found`, `entry-has-no-detail`,
  `orrery-page-has-no-detail`. `gltfLoad.ts` is the one GLB loader both the focused-model layer and
  this view call, so GLTFLoader stays a single chunk.
