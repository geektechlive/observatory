# ROCI Retrofit v2: the Instrument

**Status:** **approved by Chris on 2026-10-10.** This is the locked visual direction (design gate #35, epic #36). Decisions 1 to 3 were his explicit picks, and 4 to 6 were accepted as defaults (section 10).

**Builds on:** the ROCI Retrofit tokens shipped since May 2026, and the audit in `roci-audit-2026-10.md`.

**Prototype:** `mockups-v2.html` in this folder. It is also published as an Artifact, linked in #35.

## The idea in one sentence

Observatory is one ship's instrument trained on Earth. The globe is the lens. Everything else is the housing that holds it and reads it out.

v1 got the housing right: copper hull, cyan telemetry, red for hazard only. v2 makes the lens the hero, and gives the whole system one physical rule, so that it stops reading as "a dark dashboard with copper accents".

## 1. The light model (the one rule everything follows)

Every element is one of two kinds of matter.

|                   | **Reflective** (housing)                                                                                  | **Emissive** (data)                                                  |
| ----------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| What              | hull plates, bezels, brass fittings, labels, the Earth's surface, the basemap                             | ISS, satellites, events, quakes, fires, aurora, readout values, LIVE |
| Lit by            | one key light, top left: a highlight on the top edge, shade on the bottom, gradients only along that axis | nothing; it is the light                                             |
| Colour comes from | copper, brass and hull tokens, plus the copper grade                                                      | the data palette (section 4)                                         |
| May glow?         | **never**                                                                                                 | yes, and bloom is reserved for it                                    |
| May be graded?    | yes (the copper grade)                                                                                    | **never**                                                            |

The rule settles three things the audit found:

- **No grading on data.** The map's container `filter: sepia(...)` and the spike's CSS grade both shifted data colours. Grading belongs to reflective matter only. On the globe that means the Earth texture inside the shader. On the map it means the CARTO raster, via `raster-*` paint properties.
- **Cool hue policy.** Cyan is emissive. It is never used for structure. `--glass-bg` (hue 220) and `--panel-border` (hue 200) leak cool colour into the housing, so v2 makes them warm. Section 9 has an A/B for this.
- **Bloom budget.** Only emissive matter blooms. Copper never glows, so the copper glow box-shadows on hull pieces go.

## 2. Surface tiers

| Tier    | Material                                                                                                                   | Used for                                                   | Token family                       |
| ------- | -------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------- |
| 0 Void  | flat `--void` with a static starfield                                                                                      | page ground                                                | `--void`                           |
| 1 Hull  | opaque plate: `--hull` to `--hull-2` along the key light, a 1px top highlight, a seam line, optional rivets at the corners | panels, header, ticker band, consoles                      | `--plate-*` (replaces `--glass-*`) |
| 2 Glass | instrument glass: a blurred, faintly warm window, **only over live viewports**                                             | globe aperture, map frame, sun disc, overlays and popovers | `--glass-*` (now actually glass)   |
| 3 HUD   | emissive line work with no fill: tick rings, reticles, graticules, leader lines                                            | bezel, globe overlay, sparklines                           | `--hud-*`                          |

v1 named the hull `--glass-*`. v2 gives every name its real meaning: plates are plates, glass is glass. The radius is a single 4px. Circles are exempt. Pills go away and chips become plates.

## 3. Type

The families stay: Fraunces italic, Inter Tight, IBM Plex Mono, and Special Elite for painted marks only. What changes is the roles.

| Role      | Face                                       | Rule                                                                                                                    |
| --------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Voice     | Fraunces italic 300                        | **one per view**, used only for the console intro line. It's the instrument's single human sentence                     |
| Readout   | Plex Mono 500, `tabular-nums slashed-zero` | every live number. Units are set smaller in `--bone-dim`                                                                |
| Engraving | Plex Mono 500, caps, 0.18em tracking       | **only on hull plates**, as if stamped into the metal: panel names, bezel scale labels. Never as an eyebrow above prose |
| Body      | Inter Tight 400                            | descriptions, popovers, about                                                                                           |
| Paint     | Special Elite                              | hull markings (the ship name, hazard stencils). Decorative only, never information                                      |

The floor is **11px** (`--text-xs`). The 9px, 10px and 0.6rem literals move up to it. Fixed sizes: 11, 13, 15/17 (fluid), 22, display.

## 4. Data palette: one source, every surface

There is one module, `src/lib/palette.ts`. It exports **hex** strings, because MapLibre's colour parser rejects `oklch()` (checked against style-spec 26.4.4: oklch is REJECTED; hex, rgb() and hsl() are accepted). CSS reads the same values through generated `--data-*` custom properties. Globe, map, legend, LayerControl, ticker and VitalsSpine all read from it. The server stops assigning colours: `nws-alerts.ts` sends severity only.

### Categorical lanes (identity)

Layers are grouped into five **lanes** by kind of phenomenon. That avoids giving 15 layers 15 colours, which no palette can keep apart. Within a lane, **glyph shape** tells layers apart. Each lane has two steps, and both were found by search and checked with the dataviz validator on `--void`, using **all pairs** because every lane can be on screen at once.

| Lane              | Chart step | Emissive step | Layers and glyphs                                                    |
| ----------------- | ---------- | ------------- | -------------------------------------------------------------------- |
| Orbital           | `#0a7d87`  | `#08a8ab`     | satellites (points in shells), launches (chevron at pad)             |
| Thermal           | `#bd3701`  | `#ff8d3e`     | FIRMS fires (ember sprite), EONET wildfires and volcanoes (triangle) |
| Space objects     | `#c94db9`  | `#ca6ded`     | fireballs (star), NEO close approaches (ring)                        |
| Geophysical       | `#be8907`  | `#fbc60e`     | quakes (spike, height = magnitude), landslides and drought (square)  |
| Hydro and weather | `#0192ff`  | `#9ea8ff`     | storms (spiral), floods (drop), sea and lake ice (hexagon), buoys    |

**Chart step**, for panel charts and swatches. It passes every check:

- worst protan/deutan ΔE **9.4** (target ≥ 8);
- tritan **8.2**;
- normal vision **18** (floor 15);
- all ≥ 3:1 against the surface.

**Emissive step**, for glowing markers on the dark globe and map. It was validated **together with `--signal` (ISS) and `--mcrn`**, since all of them share the globe:

- worst CVD ΔE **6.5**, between hydro and space objects. That is in the 6 to 8 floor band, which the method allows **only with secondary encoding**.
- normal vision **14.3**, between thermal and geophysical, and between thermal and `--mcrn`. That is just under the 15 floor.
- all ≥ 3:1.

No brighter set of 6 to 7 hues clears every floor: two searches of 700 candidates each topped out at 6.7 and 14.4. So on the globe, **glyph shape is mandatory, not decorative**:

- every layer has its own glyph;
- every marker carries a void halo;
- hazards are told apart by the diamond glyph and a ring, not by red alone.

Lifting the chart steps' lightness alone (the first draft) collapsed the separation to ΔE 3.3. That's why the emissive hues differ slightly from the chart hues.

**Outside the lanes:**

- **ISS** is the hero object: `--signal` (`#74deff`), its own crosshair glyph and a permanent label. It's the only thing on the globe that is labelled at all times.
- **Aurora** is a field, not a marker. It gets a sequential ramp in a single green hue (oklch 0.80 0.17 150 at full intensity, fading to transparent), drawn as a shell, so it never competes with point markers.
- **Severity** (NWS alerts, GDACS, Kp, flare class, Sentry/Palermo) uses the **status scale**, never a lane colour. Status always comes with an icon and a label.

| Status  | Token        | Meaning                                                             |
| ------- | ------------ | ------------------------------------------------------------------- |
| nominal | `--terminal` | quiet, GO, LIVE                                                     |
| watch   | `--amber`    | elevated, M class, Kp 5, NWS minor/moderate, GDACS orange           |
| hazard  | `--mcrn`     | X class, Kp ≥ 7, NWS severe/extreme, GDACS red, Sentry Palermo > -2 |

Hazard has two tiers, because NWS has four severities but the status scale has three steps: **extreme** is a filled diamond, **severe** an outlined one. Both are `--mcrn` and both always carry their label.

**Known close pairs.** Each is handled by shape and role, not by colour:

- **Thermal against `--mcrn`** (14.3, and thermal also sits near copper land): fires are ember sprites with a void halo, while hazards are diamonds.
- **Thermal against geophysical** (14.3): ember sprite against spike.
- **Geophysical against `--amber`:** amber is status in the panels and geophysical is marker identity on the globe, so they never share a role.

All three get revalidated against sampled globe pixels in #L (finding 13).

**Cyan family.** Rule 2 is refined, not broken. Cyan means _spacecraft and telemetry_: the ISS is its brightest member (`--signal`) and orbital objects are a darker teal (`#08a8ab`, ΔE above the floor from signal). Structure is still never cyan.

Magnitude is shown by **size** (spike height, ring radius), never by changing colour inside a lane. `src/lib/severity.ts` holds the shared thresholds, so the two DST thresholds the audit found (−50 vs −100) collapse to one.

## 5. The globe

### Earth shader

- **Day:** NASA Blue Marble (`BlueMarble_ShadedRelief_Bathymetry`). It goes through the copper grade **in the fragment shader**, mixed at 94% so no blue survives as a purple cast. The prototype established three details:
  - **Grade in perceptual space.** The sampler returns linear light, so `pow(rgb, 1/2.2)` comes before the luminance is taken. Without it, land falls below the ocean thresholds and the whole Earth grades to near-black.
  - **Water gets its own ramp.** A water mask (`smoothstep(.04, .16, b - r)` on the perceptual values) sends the sea to `--void` → `--globe-grade-deep` (oklch 0.3 0.06 48, a dark hull bronze). Land climbs `--globe-grade-deep` → `--copper-2` → `--copper-glow`. The continents only read clearly once the two are separated.
  - **No additive twilight band.** Against the dark sea it reads as an object; the smoothstep terminator is enough on its own.
- **Night:** GIBS `VIIRS_Black_Marble` (verified: 200, `access-control-allow-origin: *`), rendered as **emissive** city lights in `--brass`. It's the one place emissive light lives on the Earth itself.
- **Terminator:** `smoothstep(-0.08, 0.12, dot(normal, sunDir))`, using the live subsolar point from `src/lib/solar.ts`. Twilight is a narrow copper-glow band.
- **Atmosphere:** a Fresnel rim in copper-glow on the day side, fading to a faint signal-cyan scatter on the night limb.
- **Graticule:** HUD lines every 30°, drawn in the shader at 6% bone. The equator and prime meridian are at 12%.

### Altitude in 3D

At true scale the ISS sits at about 1.07R, which is nearly invisible. **Recommended:** exaggerated LEO: `r = 1 + 0.35 * (alt_km / 2000)`, capped at 1.35. GEO doesn't sit in space; it appears as a tick band on the bezel. Quake spikes rise from the surface, with height `0.02 + 0.06 * (M - 4) / 4`.

### The bezel (the memorable thing)

A machined copper ring around the lens. From outside to inside:

1. **Outer engraving:** compass bearing scale. Major ticks every 30° with numerals, minor every 5°. The ring rotates with the globe's longitude, so the scale reads what the lens is facing.
2. **Status arc:** a 270° arc segmented by lane. Each segment is that lane's count of objects in the current data, which makes it a live legend and a census in one. Segment length is proportional to √count, so 64 satellites don't crowd out 2 fireballs.
   - A **toggled-off** lane shows as an engraved outline with no fill.
   - **Loading** shows a slow dash.
   - **Error** shows hatched MCRN and the word ERR.
   - **Stale** shows the count in `--bone-faint` with its age.
   - A **true zero** shows `0`.

   These five states must never look alike: a zero from a failed feed must not read like a quiet Earth.

3. **Inner reticle:** HUD line work in signal. Sub-solar point marker, ISS footprint ring, and a needle pointing at the ISS ground track.
4. **Readout plates:** two engraved plates at 4 and 8 o'clock. One shows the sub-solar lat/lon and the longitude the lens is facing. The other shows ISS altitude, velocity and ground position. "Next pass" was cut: it needs an observer location the site doesn't have.

Bezel text has to meet the 11px floor in **CSS pixels**. The prototype sizes it in viewBox units, so it shrinks with the lens and falls below 11px on short laptop screens. In production, size the text in px, or position HTML labels around the ring.

The bezel is SVG, reflective, and drawn from tokens. It's the same tick-ring primitive the OrbitalDial uses, so the nav and the lens look machined by the same shop. It frames the SVG fallback globe as well.

### Bloom

Selective bloom applies only to the ISS, aurora, city lights and active hazard markers. On low-tier GPUs it is replaced by additive sprites. Recommended default for phones: **sprites** (decision 3).

## 6. Motion

- **One orchestrated moment:** on load, the bezel ticks engrave in a single clockwise sweep (600 ms), the SVG globe holds, and the WebGL lens crossfades in on its first frame. Nothing else animates on entry. The per-panel `panel-enter` stagger is removed.
- **Instrument settle:** a live readout that changes value settles like a needle, with a slight overshoot (`--ease-settle: cubic-bezier(.34,1.56,.64,1)`, 350 ms). It never counts up from zero again after the first paint.
- **Continuous motion is limited to:** the globe's rotation (with a visible pause control), the ticker, and LIVE pulses.
- **One global `prefers-reduced-motion` block** in `tokens.css` stops all of it. The globe renders on demand. The SMIL pulses the audit found stop as well.

## 7. Endless Noir patterns adopted

- `tokens.css` holds every shared value, plus the keyframes and the reduced-motion block. Its header comment states the rules (section 8). Component CSS consumes tokens and never redefines them.
- **Measured contrast is written next to every ink token.** Mark-only tokens (`--copper-2`, `--mcrn-2`) are named as such.
- Text never fades through `opacity`. It swaps to a solid ink colour.
- `docs/design-system.md` becomes the runbook: a screen-to-file map, the rules, traps, and "owner overrides, do not fix back".

## 8. Rules (enforced, not aspirational)

1. Copper is reflective, data is emissive. Nothing is both.
2. Cyan means spacecraft and telemetry only (ISS brightest, orbital lane darker teal). Structure is never cool.
3. MCRN red means hazard only. Mars, Sentry rows and the quiet bands of Kp and DST don't get it.
4. Data colours come from `palette.ts` only. They are never graded and never assigned on the server.
5. One radius, 4px; circles are exempt.
6. Nothing is smaller than 11px. Text contrast is ≥ 4.5:1, as measured and recorded on the token.
7. One Fraunces line per view.
8. Engraved caps appear only on hull plates.
9. All motion stops under reduced motion.

Enforcement:

- stylelint will reject hex and rgba outside `tokens.css`, turned on one directory at a time;
- a type-floor lint enforces rule 6;
- a unit test checks that every layer in `LayerControl` has a lane in `palette.ts`.

## 9. Tokens v2 (Phase 1 #D starts from this block)

```css
:root {
  /* VOID + HULL: reflective */
  --void: oklch(0.08 0.01 50);
  --hull: oklch(0.13 0.01 60);
  --hull-2: oklch(0.18 0.02 60);
  --plate-edge: oklch(0.28 0.03 60 / 0.6);
  --plate-seam: oklch(0.4 0.02 60 / 0.35);
  --plate-highlight: oklch(1 0 0 / 0.07);
  --plate-bg: linear-gradient(180deg, var(--hull-2), var(--hull));

  /* INK: solid, measured on void / hull / hull-2 */
  --bone: oklch(0.94 0.01 80); /* 17.4 / 16.9 / 15.8 */
  --bone-dim: oklch(0.72 0.012 78); /*  8.4 /  8.1 /  7.6 */
  --bone-faint: oklch(0.62 0.012 75); /*  5.7 /  5.5 /  5.2  (was alpha .40 = 3.25, failed) */

  /* WARM: reflective. copper-2 is MARK-ONLY (4.0 on void) */
  --copper: oklch(0.62 0.13 48); /*  5.5 /  5.3 /  5.0 */
  --copper-2: oklch(0.55 0.14 45);
  --copper-glow: oklch(0.78 0.14 55);
  --brass: oklch(0.82 0.14 80); /* night city lights, fittings */

  /* EMISSIVE: telemetry + status */
  --signal: oklch(0.85 0.13 220);
  --terminal: oklch(0.78 0.18 145); /* status: nominal */
  --amber: oklch(0.84 0.16 80); /* status: watch */
  --mcrn: oklch(0.64 0.2 27); /* status: hazard. 5.6 / 5.4 / 5.1 (was 4.70 on hull-2) */
  --mcrn-2: oklch(0.5 0.22 25); /* MARK-ONLY */

  /* SURFACES */
  --glass-bg: oklch(0.14 0.02 55 / 0.62); /* warm; A/B in the prototype */
  --glass-blur: 12px;
  --scrim: oklch(0.1 0.02 50 / 0.92);
  --hud-line: oklch(0.85 0.13 220 / 0.55);
  --hud-faint: oklch(0.94 0.01 80 / 0.08);

  /* SCALES */
  --radius: 4px;
  --space-1: 2px;
  --space-2: 4px;
  --space-3: 8px;
  --space-4: 12px;
  --space-5: 16px;
  --space-6: 24px;
  --space-7: 36px;
  --text-xs: 0.6875rem;
  --text-sm: 0.8125rem;
  --text-base: clamp(0.9375rem, 0.85rem + 0.4vw, 1.0625rem);
  --text-lg: 1.375rem;
  --text-display: clamp(2rem, 1rem + 4vw, 4rem);
  --track-engrave: 0.18em;
  --track-label: 0.06em;
  --z-base: 0;
  --z-hud: 10;
  --z-overlay: 100;
  --z-popover: 200;
  --z-modal: 500;
  --z-skip: 1000;

  /* MOTION */
  --duration-fast: 200ms;
  --duration-normal: 350ms;
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-settle: cubic-bezier(0.34, 1.56, 0.64, 1);

  /* GLOBE GRADE: read once by the shader via getComputedStyle */
  --globe-grade-shadow: var(--void);
  --globe-grade-deep: oklch(0.3 0.06 48); /* sea, and low land */
  --globe-grade-mid: var(--copper-2);
  --globe-grade-high: var(--copper-glow);
  --globe-grade-mix: 0.94;
  --globe-night: var(--brass);
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

As shipped in #37, the reduced-motion block uses near-zero durations rather than `animation: none`. Animations that end on a `forwards` state (the bezel engraving) still land on their final frame instead of never drawing. CSS can only stop CSS: SMIL elements and rAF loops are gated in code with `useReducedMotion` (Codex finding 9).

The legacy aliases (`--ink*`, `--cyan`, `--magenta`, `--green`, `--gold`, `--warm`, `--orange`, `--bg`) survive for a single release, then get removed by codemod. `--magenta` uses are hand-checked first: any that aren't hazards move to a lane or to bone.

## 10. Decisions (all resolved 2026-10-10: warm glass, status scale, exaggerated LEO; 4 to 6 as recommended)

| #   | Decision                                                                                                          | Recommendation                                                                                                                                                                                                                         |
| --- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Cool hue policy:** warm glass (A) or keep cool glass (B)?                                                       | **A, warm.** It follows from the light model. The prototype shows both                                                                                                                                                                 |
| 2   | **Standards ramps:** NWS, GDACS and EPA AQI keep their conventional colours, or map onto the 3-step status scale? | **Map to status.** NWS and GDACS already are severity scales. AQI keeps its EPA 6 steps but redrawn in-hue, with the label always shown. The prototype shows both                                                                      |
| 3   | **Altitude scale:** exaggerated LEO, log-compressed, or LEO only with GEO on the bezel                            | **Exaggerated LEO, GEO as a bezel band**                                                                                                                                                                                               |
| 4   | **Textures:** self-hosted or fetched from GIBS at runtime                                                         | **Self-host both** (changed after Codex review). Both are static composites. Runtime WMS adds a dependency for no freshness gain. Sizes: 4096×2048 on desktop (about 45 MB VRAM each with mipmaps), 2048×1024 on phones (about 11 MB). |
| 5   | **Bloom on phones**                                                                                               | **Sprites** (fake glow), with real bloom on desktop                                                                                                                                                                                    |
| 6   | **Aurora**                                                                                                        | single green field ramp (as specified), not the v1 green-to-magenta                                                                                                                                                                    |

## 11. Second-model review (Codex), and what changed

The plan and this doc went through a Codex adversarial review. Every finding is accepted. Each resolution below becomes part of the named issue's scope.

| #   | Finding                                                                                          | Resolution                                                                                                                                                                                                                                                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | The overlay can't stay in sync with a renderer that owns its own rAF and exposes no pose         | `GlobeRenderer` exposes a typed `onFrame(projected: ProjectedItem[])` callback, fired after each render with the same camera and pose it drew with. The overlay writes positions only from that callback. An e2e test checks that overlay and marker coordinates agree before and after rotation                                                                               |
| 2   | `raster-*` paint properties can't grade CARTO, which is a **vector** style                       | Retheme CARTO's own vector layers: after `style.load`, walk the `fill`, `line`, `background` and `symbol` layers and set their colour paint properties from a warm hull mapping. That needs no fork and no new tile host. The container CSS filter is still removed                                                                                                            |
| 3   | The renderer inventory silently drops fireballs and GDACS                                        | A **parity matrix** issue covers every current `Globe` prop and layer: ISS and trail, events, launches, fireballs, quakes, GDACS, satellites, fires, aurora, terminator, radar sweep, DSN stations, launch pads. Each one is checked for render, glyph, tooltip, a11y, empty and error states, and a toggle test. Nothing ships until every row is green or explicitly retired |
| 4   | The texture budget counted transfer bytes and ignored GPU memory                                 | Budget by dimensions and VRAM per tier: desktop 4096×2048, phone 2048×1024, at `w × h × 4 × 1.33` per texture, plus render targets. Context loss is tested on a real phone                                                                                                                                                                                                     |
| 5   | Runtime GIBS isn't a texture pipeline                                                            | Both textures are self-hosted (decision 4). The prototype's one-shot WMS EPSG:4326 mosaics confirm the images come back seamless at 2:1                                                                                                                                                                                                                                        |
| 6   | The shader can't parse `oklch()` tokens, and the "generated CSS" has no generator                | One checked-in source, `src/lib/palette.ts`. A script generates the `--data-*` CSS and the shader's linear-sRGB constants from it, and `pnpm verify` fails on drift. The prototype's canvas `fillStyle` round-trip is fine for a review page, not for production                                                                                                               |
| 7   | A hex/rgba ban misses `oklch()`, `rgb()`, `hsl()`, named colours, SVG attributes and TSX strings | stylelint `color-named: never`, plus `function-disallowed-list` for every colour function outside `tokens.css`, plus an ESLint rule for colour literals in TS/TSX outside `palette.ts`                                                                                                                                                                                         |
| 8   | The fallbacks are load-bearing but untested                                                      | Inject a failed dynamic import, a texture 404, a renderer constructor that throws, and `webglcontextlost`. Each test asserts that the SVG stays visible, the canvas is removed, focus is preserved, and no rAF loop or listener survives                                                                                                                                       |
| 9   | A global `animation: none` doesn't stop SMIL or rAF                                              | SMIL elements render only when `useReducedMotion` is false, and every JS loop checks the flag. Both SVG and WebGL modes are tested with reduced motion on                                                                                                                                                                                                                      |
| 10  | Removing `color` from the NWS response breaks tabs that are already open                         | Two phases. First ship a client that derives colour from severity and accepts both payloads. After one cache window, drop the field and bump the cache key                                                                                                                                                                                                                     |
| 11  | "Next ISS pass" has no observer location                                                         | Cut from scope. The plate shows ground position instead (section 5)                                                                                                                                                                                                                                                                                                            |
| 12  | The census arc can show a false zero                                                             | Five distinct states (section 5)                                                                                                                                                                                                                                                                                                                                               |
| 13  | Marker contrast was checked against `--void`, not against copper land, city lights or aurora     | Every marker gets a 1px `--void` halo (a backplate ring). Validation is rerun against sampled worst-case globe pixels: copper land and city lights                                                                                                                                                                                                                             |
