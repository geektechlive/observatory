# ROCI design-system audit (2026-10)

**What this is:** the input to the ROCI v2 direction (#35), done for #34 and part of the redesign epic #36.

**What was audited:** `src/` at `8a19566`, plus `functions/api/nws-alerts.ts`, because that file assigns map colours on the server.

**Method:**

- the `design:design-system` audit;
- the `design:accessibility-review` audit (WCAG 2.1 AA, plus 2.5.8 for target size);
- a structural comparison with Endless Noir's `clients/web/deco.css`.

Contrast was **measured**: oklch is converted to sRGB, alpha is composited over the real surface, and then WCAG luminance is taken. Three things were not run: an axe pass, screen-reader testing, and the full build.

## Headline

**Score: 48/100.** There are 63 tokens and 284 hardcoded colour literals across 50 files. The tokens are adopted well for typography and for copper and ink. The system is weak in five places:

1. **No shared data palette.** Every surface (globe, map, legend, layer control, ticker, spine) invents its own colours for the same data.
2. **One token fails contrast.** `--bone-faint` measures **3.25:1** and is used for about 93 pieces of text. This is the single biggest accessibility failure.
3. **Missing scales.** There is no spacing, z-index, tracking or shadow scale. 248 spacing literals use 75 distinct values.
4. **The primitives don't carry the chrome.** `GlassPanel` hardcodes its own background token. The padding under the label bar is copied into 21 modules, and the loading/unavailable/empty states are copied into more than 20.
5. **The palette rules are broken in practice.**
   - MCRN red is meant for hazards only, but it's used for Mars, for every Sentry row, and through the `--magenta` alias (18 uses).
   - Cool hues (200–250) leak into the warm hull: `--glass-bg`, `--panel-border`, the terminator and the SkyStage gradients.

## 1. Tokens

| Role          | Tokens                                                                    | Finding                                                                                                                                                                                                   |
| ------------- | ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Void and hull | `--void`, `--hull`, `--hull-2`, `--plate-edge`, `--plate-seam`            | **`--hull` and `--hull-2` are never used.** Five plates hand-roll hull gradients instead.                                                                                                                 |
| Ink           | `--bone`, `-dim`, `-faint`                                                | The legacy `--ink-*` aliases are used more than the real names, 133 to 59.                                                                                                                                |
| Warm          | `--copper`, `-2`, `-glow`, `--brass`                                      | **`--brass` is unused** and nearly the same as `--amber`.                                                                                                                                                 |
| Cool          | `--signal`, `-2`, `--terminal`                                            | `--signal` has about 20 literal copies. `--signal-2` is almost unused.                                                                                                                                    |
| Hazard        | `--mcrn`, `-2`, `--amber`                                                 | `--amber` is the most-used accent (50 uses).                                                                                                                                                              |
| Type          | 6 families, 4 sizes                                                       | `--font-display` = `--font-editorial`, and `--font-mono` = `--font-stencil`. There is no size below 11px, so 9px, 10px and 0.6rem are written by hand more than 30 times. **`--text-display` is unused.** |
| Borders       | `--panel-border*` (hue 200) vs `--glass-border` → `--plate-edge` (hue 60) | **Two border systems.** One is cool and used only by GlassPanel; the other is warm and used 44 times.                                                                                                     |
| Glass/depth   | `--glass-*`, `--depth-shadow-*`                                           | Effectively private to GlassPanel. **`--glass-bg` is hue 220 (cool) on a copper hull.**                                                                                                                   |
| Layout        | `--status-bar-*`, `--space-section`                                       | **Unused.** `--status-bar-bg` holds the exact scrim value that about 9 files hardcode.                                                                                                                    |
| Shape         | `--radius-tile/-panel/-hero`                                              | Three names for the same 4px.                                                                                                                                                                             |
| Motion        | `--duration-*`, `--ease-out-expo`, `--pulse-duration`                     | Healthy.                                                                                                                                                                                                  |

### Legacy aliases to retire

| Alias                                 | Resolves to                | Uses                                                    |
| ------------------------------------- | -------------------------- | ------------------------------------------------------- |
| `--ink-faint` / `--ink-dim` / `--ink` | `--bone-*`                 | 91 / 33 / 9                                             |
| `--cyan`                              | `--signal`                 | 33                                                      |
| `--magenta`                           | `--mcrn` (renders **red**) | 18 (hand-check each one for hazard meaning)             |
| `--green` / `--gold`                  | `--terminal` / `--amber`   | 5 / 2                                                   |
| `--warm`, `--orange`                  | their own literals         | 3 / 1 (decide whether to make them tokens or drop them) |
| `--bg`                                | `--void`                   | 0                                                       |

### Dead code

- All 9 `.text-*` utilities.
- `.belter`.
- `[data-editorial]`.
- The `@font-face Inter` rule. Inter Tight is the one in use.
- The `StatNumber` component, which is never imported.
- `.radarSweep` / `.radarArm`.

**Unstyled:** the EONET click popup's `.eonet-popup-inner/-date/-link`.

## 2. Hardcoded colours: 284 literals

Each literal was matched against the nearest token in OKLab:

| Bucket                      | Count   | Action                                                                       |
| --------------------------- | ------- | ---------------------------------------------------------------------------- |
| Exact token copy (ΔE ≤ .02) | 74      | Swap in the token                                                            |
| Drifted copy (≤ .06)        | 88      | Snap to the token                                                            |
| Off-palette (> .06)         | 76      | Promote to a token, or delete                                                |
| Black shadows / white tints | 19 / 26 | New `--shadow-*`, `--row-hover`, `--row-divider` and `--stroke-light` tokens |

**Worst files:**

| File               | Literals |
| ------------------ | -------- |
| `WorldMap.tsx`     | 45       |
| `App.module.css`   | 37       |
| `Globe.tsx`        | 15       |
| `global.css`       | 14       |
| `LayerControl.tsx` | 13       |
| `SkyStage.tsx`     | 13       |

**Pre-Belter leftovers to purge:**

- navy `rgba(4,6,15,a)` and `rgba(10,14,30,.92)` (map badges, lightbox, about popover);
- the footer's cool white;
- Tailwind emerald, amber, sky and slate hex values (live indicator, ISS on the map, EONET fallback).

## 3. Drift (literals where a token should be)

| Property       | Literal / tokenised | Distinct values | Note                                                          |
| -------------- | ------------------- | --------------- | ------------------------------------------------------------- |
| spacing        | 248 / 8             | 75              | `36px 16px 16px` appears 21×, which is the label bar plus 8px |
| letter-spacing | 114 / 1             | 20              | 0.02–0.24em                                                   |
| font-size      | 74 / 133            | 36              | 0.6rem ×12, 9px ×8, 10px ×8                                   |
| border-radius  | 32 / 21             | 10              | 2px ×14, 999px/99px pills                                     |
| z-index        | 22 / 0              | 11              | 0 … 9999                                                      |
| shadows        | 13 / 5              | 13              | all one-offs                                                  |
| blur           | 14 / 2              | 6               | 4–24px                                                        |

## 4. Chrome that should be primitives

| Cluster                              | Evidence                                                                                                               | Primitive                                             |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Panel body under the label bar       | 21 modules repeat `padding: 36px 16px 16px`                                                                            | `GlassPanel` body slot plus a `--panel-label-h` token |
| Loading / unavailable / empty states | `.loading` ×20, `.unavailable` ×22, four different min-heights; "unavailable" is amber in 3 panels and faint elsewhere | `<PanelState kind>`                                   |
| Micro label (mono, xs, faint, caps)  | 8 identical copies, plus variants                                                                                      | `<Label tone>`                                        |
| Copper stencil label                 | 6 copies; the `--font-stencil-*` tokens are used once                                                                  | `<StencilLabel>`                                      |
| Readout (value + unit)               | VitalsSpine, counter, geomag = sun-stage, mars = cme, plus the dead StatNumber                                         | `<Readout value unit tone size>`                      |
| Lists, rows, tables                  | the hover tint appears 14× with 5 alphas; the row divider 4×                                                           | `<DataList>`, `<DataTable>`, plus row tokens          |
| Floating overlays                    | about 9 scrim recipes in 3 palettes; `EventTooltip` uses inline styles                                                 | `<Overlay>` plus `--scrim`, `--scrim-strong`          |
| Chips, pills, toggles                | 6 implementations                                                                                                      | `<Chip>`, `<Toggle>`, `--radius-pill`                 |
| Swatches and dots                    | 6 implementations                                                                                                      | `<Swatch>` reading the data palette                   |
| Plate frames outside GlassPanel      | globeFrame, telemetryPlate, header, ticker, Sky/Sun stages                                                             | `<Plate variant>` on `--hull`/`--hull-2`              |
| Severity functions                   | `kpColor` ×4; `dstColor` ×2 **with different thresholds** (−50 vs −100); flare-class ×3; `bzColor` ×2; quake ramp ×3   | `src/lib/severity.ts`                                 |

## 5. Data colour semantics: the biggest structural gap

The same datum is coloured differently on each surface:

| Layer                              | Globe                 | Map                             | Legend / LayerControl | Ticker               | Problem                                                           |
| ---------------------------------- | --------------------- | ------------------------------- | --------------------- | -------------------- | ----------------------------------------------------------------- |
| ISS                                | `--signal`            | `#7dd3fc` (sky-300)             | `--signal`            | n/a                  | The map doesn't use the token; the label text and font differ too |
| Quakes                             | oklch ramp            | hex ramp                        | single swatch         | n/a                  | 3 ramps (globe, map, spine) with the same thresholds              |
| Fires                              | oklch ramp            | hex ramp                        | `.85 .2 55`           | n/a                  | The ember colour is nearly the same as EONET wildfire             |
| EONET volcanoes                    | magenta, hue 320      | `#dd44ff`                       | **copper-glow**       | `--orange`           | The legend doesn't match the dot it describes                     |
| EONET earthquakes / floods         | yellow / blue         | yellow / blue                   | amber / blue          | **both `--cyan`**    |                                                                   |
| EONET landslides, sea ice, drought |                       |                                 | drought missing       | **missing**          | Labels differ: "Sea/Lake Ice" vs "Sea Ice"                        |
| NWS alerts                         | n/a                   | **server-assigned iOS colours** | no legend             | n/a                  | The colours are baked into the API payload and its cache          |
| Buoys / aircraft / AQI             | n/a                   | Tailwind hexes                  | no legend             | n/a                  | `#38d4ff` and `#4ade80` each mean three different things          |
| Aurora                             | top tier `255,90,200` | n/a                             | hue 145               | n/a                  | Off-palette magenta; the swatch shares a hue with satellites      |
| Flares / CME / Sentry              | n/a                   | n/a                             | n/a                   | all amber / all MCRN | The ticker ignores the class and Palermo grading                  |

**Hue collisions:**

- Orange (hue 55–60) is used for quakes M4.5–6, FIRMS mid, GDACS Orange and fireballs.
- Green (hue 145) is used for satellites, the aurora swatch and the LIVE status.

**Logic bug:** MapLegend counts every category on an event, but WorldMap colours each event by `categories[0]` only.

## 6. Accessibility

### Measured contrast (surfaces: void, hull, hull-2, glass-over-void)

| Ink                                    | Range         | AA text                                                                                           |
| -------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------- |
| bone                                   | 15.8–17.4     | pass                                                                                              |
| bone-dim (α .66)                       | 7.3–7.5       | pass                                                                                              |
| **bone-faint / ink-faint (α .40)**     | **3.25–3.39** | **fail**, about 93 text uses: table headers, footer, labels, data age, legend counts, ticker time |
| **DataAge** (bone-faint × opacity .75) | **≈ 2.4**     | **fail**                                                                                          |
| **`.belter`** (copper × .85)           | **4.07**      | **fail** (dead class, but remove it)                                                              |
| copper                                 | 4.9–5.5       | pass                                                                                              |
| copper-2 / mcrn-2                      | 2.96–4.05     | fail as text (they are only used for borders and rivets; record them as mark-only)                |
| copper-glow, signal, amber, terminal   | 8–13          | pass                                                                                              |
| mcrn                                   | 4.70–5.18     | pass (only just, on hull-2)                                                                       |
| About popover links vs body text       | **1.70**      | fail 1.4.1 (no underline)                                                                         |

### Other findings

| Severity | Finding                                                                                                                                                                                                                                                                                                                                              |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Critical | `--bone-faint`, as measured above. Fix it once in the token (about α .56, or opaque `oklch(.66 .01 80)`) and add a measured-contrast note next to it.                                                                                                                                                                                                |
| Major    | The SMIL pulses on EventMarkers, IssMarker and StationMarkers, and MapLibre's `flyTo`, ignore reduced motion. There is no global `prefers-reduced-motion` block.                                                                                                                                                                                     |
| Major    | The globe auto-rotates with no pause control (2.2.2). A focused marker unmounts when it rotates to the far side, and focus drops to `<body>`. The tab order reshuffles every 100 ms.                                                                                                                                                                 |
| Major    | Panel labels and console titles are `<span>`s. The only `<h2>` is the APOD title, so heading navigation is almost empty (1.3.1).                                                                                                                                                                                                                     |
| Major    | Targets under 24px: LayerControl rows (about 20px), ticker items (about 17px), "Read more" and the popover links (about 16px).                                                                                                                                                                                                                       |
| Major    | Ticker items are `span role=button`. The sortable `<th>` cells have no button. The Sun wavelength and imagery "tabs" have no tabpanels or arrow keys.                                                                                                                                                                                                |
| Major    | The LaunchPanel countdown is `aria-live`, so it may announce every tick.                                                                                                                                                                                                                                                                             |
| Minor    | The lightbox close button has `outline: none`. Globe markers have no focus ring. AboutPopover lacks `aria-modal`. VitalsSpine can't be scrolled by keyboard in Safari. StarField goes stale after a resize under reduced motion. Sparkline has a default label. `aria-label` is set on generic `div`s. Two 10px text rules sit below the 11px floor. |

## 7. What to take from Endless Noir's `deco.css`

| Pattern                                                                             | Adopt     | Why                                                                                                                                                       |
| ----------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One file holds every shared value; component CSS consumes it and never redefines it | **adapt** | Keep the CSS modules. `tokens.css` becomes tokens plus shared keyframes plus the global reduced-motion block. The rule is "shared values live only here." |
| Measured contrast written next to the token, with near-miss values named and banned | **yes**   | Directly fixes the `--bone-faint` class of bug                                                                                                            |
| "Mark-only" tokens kept separate from text tokens                                   | **yes**   | `--copper-2`, `--mcrn-2` and the faint ink become marks only                                                                                              |
| No faded text through `opacity`; swap to a solid colour instead                     | **yes**   | Over glass, alpha contrast depends on what's behind it                                                                                                    |
| Type floor (nothing under 11px)                                                     | **yes**   | Add a stylelint check                                                                                                                                     |
| Non-negotiable rules stated in the CSS header and the runbook, and enforced         | **yes**   | Copper is the warm world, cyan is telemetry, MCRN is for hazards only, one radius, data colours are never graded                                          |
| Named type roles (eyebrow, data, display)                                           | **adapt** | Ships as `<Label>`, `<StencilLabel>` and `<Readout>`                                                                                                      |
| One global reduced-motion block                                                     | **yes**   |                                                                                                                                                           |
| A design runbook (screen→file map, past traps, overrides not to "fix back")         | **yes**   | Write `docs/design-system.md`                                                                                                                             |
| Responsive by breakpoint overrides                                                  | no        | Observatory's fluid `clamp()` tokens fit a dashboard better                                                                                               |
| A generator for brand assets                                                        | later     | Only if OG and social art multiply                                                                                                                        |
| The Deco brand look itself                                                          | no        | Observatory keeps copper ROCI                                                                                                                             |

## 8. Decisions for the direction doc (#35)

1. **Data palette.** Use one `src/lib/palette.ts` that exports literal strings, because MapLibre paint properties can't resolve `var()`. Every surface reads from it. NWS colouring moves to the client, so the API sends only severity.
   - Open question: do standards ramps (EPA AQI, NWS severity, GDACS red/orange) keep their conventional colours, or get redrawn in the Belter palette?
2. **`src/lib/severity.ts`.** Shared ramps for Kp, DST, flare class, Bz, quakes and Palermo, with the DST thresholds reconciled.
3. **Cool-hue policy.** Either the glass and border tokens become warm, or cool is deliberately confined to telemetry (signal). It should not leak into structure by accident.
4. **Missing scales.** Space (2/4/6/8/12/16/24), z-index, `--radius` plus `--radius-pill`, `--text-2xs`, tracking, shadows, row hover and divider.
5. **Primitives.** The table in §4.
6. **Fix the accessibility debt during the reskin, not after it.** Each Phase 3 surface issue closes the findings that belong to it.
