# Satellite 3D models: catalog, gaps and licences

The working record for [#194](https://github.com/geektechlive/observatory/issues/194): which 3D
models exist for the Earth-orbit satellites the orrery draws, under what licence, and how many
satellites each one covers. The deep-space and L1 craft we already ship are in
`src/lib/orrery/craftModels.ts`; this page covers everything else.

Researched 2026-11-10. **VERIFIED** means the page, API or repository was read that day;
**UNVERIFIED** means seen only in a search snippet or inferred. Keep this page current as models
land, licences are answered or new families appear.

## Rules a model has to meet

- The licence allows free public display on a website **and** modification (we decimate and
  simplify every model at build time).
- Under 500 kB per model, measured on the file we ship. That file is **uncompressed**:
  the build decodes Draco and meshopt and writes plain quantized GLB, because the CSP has no
  `'wasm-unsafe-eval'` for a decoder (ADR 0011, `scripts/craft-models.mjs`). The budget is
  `check-bundle`'s `craft-model-bytes`.
- No agency logos or insignia (CLAUDE.md). Check the mesh and its textures, not only the
  thumbnail. For NASA's marks this is also a legal requirement (14 CFR 1221), not only a style
  rule.
- Credit as the licence asks, in the same shape as `craftModels.ts` (credit line plus source URL).
  A CC BY credit names the creator, the model URL and the licence URL, and says the model was changed
  (CC BY 4.0: "give appropriate credit, provide a link to the license, and indicate if changes
  were made").
- A manifest entry in `scripts/craft-manifest.mjs` that passes the gate (next section).

## The asset gate

Decision record: [ADR 0020](../decisions/0020-models-ship-through-a-gate.md).

Every file in `public/models/craft/` has an entry in `scripts/craft-manifest.mjs` (#202): source
URL and version, licence and its evidence (text and URL), SHA-256 of each downloaded source file,
family, logos checked (date, result `clean`) and the triangle budget. `node scripts/craft-models.mjs
<source-dir> [name...]` reads the source files its manifest entry pins (the build fails if they
differ), checks each against its hash, builds into a temporary staging folder (removed when the
build ends), and copies a file to `public/models/craft/` only if its entry is complete, the file
is within `craftModelBytes` and its triangle count is at most 5% over the entry's budget
(`scripts/craft-gate.mjs`). A name that matches no manifest entry is an error. `tests/unit/scripts/craft-manifest.test.ts`
fails when a file anywhere under `public/models/` has no complete entry, and when a descriptor
points at a file with none.

The ten models shipped by #115 are marked `legacy`: their source downloads were not kept, so
their source hash, version and logo check are recorded as unknown (not invented). The manifest
pins their shipped bytes instead, and the build will not promote a legacy entry. To rebuild one,
download its source, fill in the real hash, version and logo check, and delete `legacy`. A plain
`node scripts/craft-models.mjs <dir>` therefore exits 1 while every entry is legacy: it builds,
and refuses to promote each one.

At runtime a model is a `ModelDescriptor` (`src/lib/orrery/modelDescriptor.ts`): spacecraft by
NAIF id, satellites by NORAD id and then family, each saying whether it is the object's own model
or a family stand-in. `loadModel` (`three/craftModelLoad.ts`) loads, centres and fits one for any
view.
The focused-model layer still loads through its own path; when #194 adds satellites, it should move
to `loadModel` and dedupe on key plus descriptor.

## How much of the dot cloud each family is

CelesTrak GP data, `gp.php?GROUP=<group>&FORMAT=csv`, 2026-11-10 17:50 UTC. Family counts inside
`active` come from matching object-name prefixes, so the smaller families are approximate.

| Family                                   | Objects            |
| ---------------------------------------- | ------------------ |
| All active                               | 16,903             |
| Starlink                                 | 11,201 (66.3%)     |
| OneWeb                                   | 651                |
| Kuiper                                   | 391                |
| Qianfan                                  | 275                |
| Hulianwang Digui                         | 231                |
| Yaogan                                   | 170                |
| Cosmos (all kinds, including 28 GLONASS) | 144                |
| Planet Flock                             | ~109               |
| Spire Lemur                              | ~95                |
| Iridium NEXT                             | 80                 |
| BeiDou                                   | 56                 |
| GPS (Navstar)                            | 40 (`gps-ops`: 32) |
| Globalstar                               | 36                 |
| Galileo                                  | 32                 |
| GLONASS (`glo-ops`)                      | 28                 |

Other CelesTrak groups that day: `weather` 74, `science` 45, `stations` 19, `geo` 568.

One Starlink model would put a real shape behind two thirds of every satellite drawn.

## The licence basis for NASA models (VERIFIED)

- The [NASA-3D-Resources](https://github.com/nasa/NASA-3D-Resources) README: "These assets are
  free and without copyright."
- NASA's [images and media guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media):
  "This general permission extends to personal Web pages", "NASA should be acknowledged as the
  source of the material", and "The NASA Insignia, Logotype, identifiers, and imagery are not in
  the public domain." The page says nothing either way about modifying files. The 10 craft we
  ship rest on the same basis.
- [science.nasa.gov/3d-resources](https://science.nasa.gov/3d-resources/): "All of these assets
  are free to download and use."
- **Take NASA models from GitHub or science.nasa.gov, not from NASA's Sketchfab uploads.** The
  licence shown on Sketchfab may differ from the GitHub copies (UNVERIFIED: Sketchfab pages don't
  render to automated fetches, so a CC BY-NC label on NASA's uploads, for example Hubble, was not
  confirmed from a primary source). The GitHub and science.nasa.gov copies are "free and without
  copyright" (VERIFIED, README).
- Credit: "NASA" plus the model page's own Source field (for example "NASA/Christian A. Lopez"
  for Terra), and the page URL. A page whose Source is a company (Hubble (A): "DigitalSpace
  Corporation") is credited "NASA 3D Resources, model by DigitalSpace Corporation".

## Tier A: usable now

### NASA models

From `https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/<name>`. Raw GLB sizes
are from the repository tree (VERIFIED). Three are built and shipped, the trial batch of
2026-11-11 (see "The trial batch" below); the rest are not built, and no other mesh has been
checked for logos yet.

| Model                              | Covers                                         | Raw GLB                                 | Notes                                                                     |
| ---------------------------------- | ---------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------- |
| ISS (A) / ISS (B)                  | ISS: 6 CelesTrak records (see below)           | 39.7 kB / 477 kB                        | **(B) built**, credit "NASA/Michael D. Carbajal"; (D) is 95.9 MB, too big |
| Hubble Space Telescope (A)         | HST                                            | 1.69 MB                                 | **Built**, credit "DigitalSpace Corporation" (the page's Source)          |
| TDRS (A), (B), (E)                 | TDRS (8)                                       | 96.8 kB, 976 kB, 217 kB                 | Generations differ; one model for all is approximate                      |
| Terra                              | Terra                                          | 2.15 MB                                 | **Built**, credit "NASA/Christian A. Lopez"; no textures (see below)      |
| Aqua (B)                           | Aqua                                           | 1.10 MB                                 |                                                                           |
| Aura (A)                           | Aura                                           | 476 kB                                  |                                                                           |
| Landsat 8                          | Landsat 8, 9                                   | 780 kB                                  | Landsat 9 as a near twin is UNVERIFIED                                    |
| Suomi NPP                          | Suomi NPP; look-alike for NOAA 20, 21          | 2.28 MB                                 |                                                                           |
| GOES                               | GOES 14–19 (6)                                 | 336 kB                                  | Which generation it shows is UNVERIFIED                                   |
| ICESat-2 (A)                       | ICESat-2                                       | 1.5 MB                                  |                                                                           |
| OCO-2                              | OCO-2                                          | 280 kB                                  |                                                                           |
| SORCE, SDO, Fermi, SWAS, Chandra   | 1 each                                         | 366 kB, 498 kB, 1.38 MB, 150 kB, 999 kB |                                                                           |
| MMS (A)                            | MMS 1–4                                        | 336 kB                                  |                                                                           |
| THEMIS                             | THEMIS A, D, E                                 | 683 kB                                  |                                                                           |
| CYGNSS                             | CYGNSS (7)                                     | 1.62 MB                                 |                                                                           |
| GRACE (A)                          | GRACE-FO 1, 2 (look-alike, predecessor design) | 22.6 kB                                 |                                                                           |
| Jason-1 / OSTM                     | Jason-3 (look-alike)                           | 593 kB / 925 kB                         |                                                                           |
| Jason CS                           | Sentinel-6A, 6B                                | 2.1 MB                                  | Same family                                                               |
| GPM                                | GPM Core                                       | 2.26 MB                                 |                                                                           |
| CubeSat 1RU, 2RU, ICECube, MiRaTa  | Generic stand-in for CubeSat fleets            | 149–445 kB                              | Flock and Lemur are 3U, so approximate                                    |
| Satellite Kit (body, wings, radio) | Generic stand-in for any bus                   | 3–15 kB each                            | Assembled by us, as for New Horizons                                      |

About 53 active objects have a same-mission NASA model (including 8 look-alikes): few by count,
but they are the named objects people click.

### The trial batch (#194, 2026-11-11)

ISS (B), Hubble Space Telescope (A) and Terra went through the asset gate first, to measure real
built sizes before raising any budget. All three are `scope: 'own'`, registered in
`SATELLITE_MODELS_BY_NORAD` (`src/lib/orrery/modelDescriptor.ts`) and shown by "Look closer".

**Sources are not in the repository.** Each entry in `scripts/craft-manifest.mjs` names the model's
folder in NASA-3D-Resources at the pinned commit `11ebb4ee043715aefbba6aeec8a61746fad67fa7`
(`sourceUrl`, `sourceVersion`) and the SHA-256 of the file. To rebuild, download the GLB from
`https://raw.githubusercontent.com/nasa/NASA-3D-Resources/11ebb4ee043715aefbba6aeec8a61746fad67fa7/3D%20Models/<folder>/<file>`
into an empty folder, treat it as untrusted data, and run `node scripts/craft-models.mjs <folder> iss hubble terra`.
The build refuses a file whose hash differs.

**Build-time edits are recorded, and the output is pinned.** Each model's edits (`blank`,
`dropNodes`, `dropExternalImages`, `aim`) live in `scripts/craft-sources.mjs` and again as
`transforms` in its manifest entry, because the logo record vouches for the file those edits
produce. `tests/unit/scripts/craft-manifest.test.ts` fails when the two differ. Each entry also
pins `outputSha256`, the hash of the shipped file, and the same test fails when the file in
`public/models/craft/` has other bytes. **A rebuild that changes the bytes (a new simplifier, a
changed option, a dependency update) must update `outputSha256` in the manifest on purpose**:
the build prints the new hash and exits 1 when it differs from the pinned one. If the edits
changed what the model shows, redo its logo check too.

| Model  | NORAD ids                                | Source file (SHA-256 prefix)                         | Raw         | Built     | Triangles (source, built, budget) | Credit (the page's Source field)                     |
| ------ | ---------------------------------------- | ---------------------------------------------------- | ----------- | --------- | --------------------------------- | ---------------------------------------------------- |
| ISS    | 25544, 25575, 26400, 26700, 36086, 49044 | `International Space Station (ISS) (B).glb` 2ba44274 | 476,992 B   | 175,712 B | 174,440, 14,130, 14,000           | NASA/Michael D. Carbajal                             |
| Hubble | 20580                                    | `Hubble Space Telescope (A).glb` e5ba4de1            | 1,694,988 B | 174,404 B | 7,672, 7,672, 7,672               | NASA 3D Resources, model by DigitalSpace Corporation |
| Terra  | 25994                                    | `Terra.glb` 87948575                                 | 2,150,600 B | 162,740 B | 117,120, 14,119, 14,000           | NASA/Christian A. Lopez                              |

The three build in under a second in total on the development laptop (the script times each
model and prints about 0.1 s). Credits are read from each model's science.nasa.gov page, which
lists "Source" (for example `https://science.nasa.gov/3d-resources/terra/`).

**The ISS has six CelesTrak records, not three.** The `stations` group has ISS (ZARYA) 25544, POISK
36086 and ISS (NAUKA) 49044, and `active` (the "Other active" group) adds ISS (UNITY) 25575, ISS (ZVEZDA)
26400 and ISS (DESTINY) 26700 (CelesTrak GP data, 2026-11-10). All six carry the same element set
(mean motion 15.49289712, inclination 51.6322, same epoch) and each is a satellite-catalog entry
owned by the ISS programme (owner ISS, or CIS for Nauka), so the orrery draws six dots at one place.
They share one model. The docked Soyuz, Progress and Dragon records in `stations` also share the
element set but are separate spacecraft, so `scope: 'own'` would be false for them; they have no
model.

**Build steps specific to these models** (`scripts/craft-models.mjs`):

- ISS: the simplifier lands about 2.3k triangles above whatever it is aimed at on this model (a 14k
  target gave 16,583, 16,600 gave 19,036, 20,000 gave 22,196; a larger error did not help and
  `minPart` deletes real parts), so `aim` is 11,700 and the file lands at 14,130, 0.9% over its
  14,000 budget (the gate allows 5%).
- ISS, a change we made: the source holds seven flat discs, nodes `bendedtru1`, `bendedtru2`,
  `bendedtru3`, `bendedtrus`, `pCylinder1`, `pCylinder2` and `pCylinder8` (320 triangles each,
  about 5.3 by 0.5 by 5.3 model units, overlapping, centred near x = -6 and all at y = 41). The
  station spans y = -4 to 26 and x = -3 to 3 (model units; the model is about 45 units across).
  They touch nothing, the real ISS has no such parts, and NASA's preview render shows none, so
  they are modelling leftovers and the build drops them. The built model's extent goes from
  14.35 x 45.43 x 45.54 to 6.08 x 20.19 x 45.54, so a framing by full extent sees the station
  and not the discs. Rendered alone, highlighted in red, they are a flat stack of overlapping
  discs (`strays-194/render-alone.png` in the session scratchpad, not kept in the repository).
  With the rest of the model present they did not show in Look closer at all (zero red pixels
  in the highlighted render); why was not found.
- Hubble: the source has 7,672 triangles, below the 9k to 16k of the other craft, so nothing is
  simplified and its budget is that count. Its five textures stay (WebP, at most 512 px a side).
  One 34 x 18 px rectangle of the aft bulkhead texture (`hbltel_w`) is painted the colour of the
  pixels around it (`blank` in `SOURCES`, `blankRegion` in `scripts/craft-gate.mjs`), because it
  holds a label plate whose small glyph could not be identified (logo check below). The build
  fails if no material uses a texture of that name.
- Terra: the file names two external TGA textures (`..\Terra.fbm\Side_Panels_TERRA.tga` and
  `solarpanels.tga`) that are not in NASA's repository, so it cannot be read as it is. The build
  rewrites the file in memory without its images, samplers and texture references
  (`glbWithoutExternalImages`, `scripts/craft-gate.mjs`); materials keep their colour factors, so
  the panels draw flat blue instead of textured. The file on disk and its hash are unchanged.

**Logo check, 2026-11-11.** Every texture image in each file was extracted and viewed; a few label
areas were enlarged. NASA's own preview render of each model and real-GPU renders of the shipped
files from five angles each (Look closer at 1920 x 1080) were also viewed. None shows an insignia,
meatball, worm, patch, flag or company logo.

- ISS (B): no textures; 19 plain grey materials. Clean.
- Hubble (A): five textures (each also stored as a PNG fallback of the same picture): a panel sheet
  with four 20 x 8 px serial plates (the text is unreadable), a white-topped sheet with a vented
  plate and a lens-like circle, grey blanket panels, the solar array cells, and a dark sheet with
  cabling. The last has one 25 x 10 px plate reading "30" beside a glyph about 6 px across. It
  stayed unidentifiable at 20x in the lossless PNG fallback of the same picture, so it is not
  judged: the build paints the plate out, and the shipped texture was viewed again, plate gone.
  The remaining features are serial plates, screws and cabling; none resembles a mark.
- Terra: no textures in the shipped file (see above). Whatever the two missing textures carried is
  not in the model; the preview render and the renders show plain colours.

**Where the models fall short** (found while taking the screenshots; not fixed here):

- The ISS (B) source held seven stray parts. They are dropped in the build (`dropNodes` in
  `SOURCES`, `scripts/craft-nodes.mjs`), see the ISS build step above.
- The default framing in "Look closer" crops all three: the ISS at its arrays, Hubble at the
  top, Terra at its array. Hubble and Terra have no such stray parts, so the framing is a
  separate matter.
- **The credit line sits over the model** when the model fills the stage (seen on the ISS and
  Hubble). A required credit is a licence term, so this needs a fix in the detail view.
- The attitude axes in `modelDescriptor.ts` are read from each model's frame but only matter once
  satellites are drawn as models in the orrery (not done yet). Terra (-Y, its antenna sits on a boom
  at +Y) comes from the mesh and renders. Hubble is `sun` with axis X: its barrel is Y and this
  model's arrays are thin along Y, so aiming an array face at the Sun would aim the aperture at
  it; X keeps the aperture off the Sun line and the arrays are drawn in one position. The ISS
  axis is the thin axis, X (the station flies with the truss across the orbit and the thin
  axis vertical), but which of +X and -X faces Earth was not determined.

### Other models under CC BY 4.0

Licence labels read from the Sketchfab API (VERIFIED). CC BY needs the title, author, source
link, licence link and a note of changes:
`"<title>" by <author>, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/), <model URL>; simplified for this site.`
All are artists' models, not the operators'. Downloading needs a free Sketchfab login.

| Model                                                                                                                                   | Covers            | Faces     | Notes                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ["Starlink Spacex Satellite"](https://sketchfab.com/3d-models/starlink-spacex-satellite-0a60f6720c5141c9a1c6d71aac108b31) by Malacodart | Starlink (11,201) | 19,644    | Author: "You can use the model for personal and commercial purposes, just remember to add credit". Early flat-panel design. No logo in the thumbnail; mesh and textures not checked. Built size not measured |
| ["GLONASS-M"](https://sketchfab.com/3d-models/glonass-m-9660a3d4b72f47c2adde1be1d209b6bc) by tashtego                                   | GLONASS (28)      | 2,382     | Not inspected                                                                                                                                                                                                |
| [Tianhe core module](https://sketchfab.com/3d-models/a1ee21cce5174f4e9349bfaa4e164a05) by 博格博士 (BGBS)                               | Tiangong core (1) | 104,116   | Untextured; panels not deployed; Wentian and Mengtian missing; needs decimation                                                                                                                              |
| ["GPS Satellite"](https://sketchfab.com/3d-models/gps-satellite-2266e391d66144e2bd676ea16c449dc0) by ABC Almaty                         | GPS (40)          | 1,942,918 | Needs heavy decimation; a "maybe"                                                                                                                                                                            |

## Tier B: a model exists, but the licence is a problem

| Item                                                                                                                      | Problem                                                                                                                                                                  | Who to ask                                       |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| [Starlink 2022 scan](https://sketchfab.com/3d-models/starlink-satellite-2022-70361e8f586e44e795d0b27220fe402a) (Acidance) | CC BY-NC-SA: share-alike on our simplified copy                                                                                                                          | The author                                       |
| Glonass K1 (Ilya)                                                                                                         | CC BY-NC-ND: no derivatives, so no simplifying                                                                                                                           | The author                                       |
| Metop (erkin.yaron, a scan)                                                                                               | CC BY-NC-SA                                                                                                                                                              | The author                                       |
| ISS models on Sketchfab (several)                                                                                         | ND or NC-ND                                                                                                                                                              | Not needed: NASA's ISS is tier A                 |
| NASA's own Sketchfab uploads                                                                                              | May differ from the GitHub copies (UNVERIFIED; see above)                                                                                                                | Use the GitHub or science.nasa.gov copies        |
| ESA Rosetta (ESA's only downloadable Sketchfab model)                                                                     | CC BY-NC; not an Earth satellite                                                                                                                                         | n/a                                              |
| "Global Star" (uperesito)                                                                                                 | CC BY on Sketchfab, but taken from the Celestia Motherlode: rights to the original unclear                                                                               | Skip unless confirmed                            |
| ESA Sentinel, Galileo, MetOp, MTG                                                                                         | No official downloadable model or licence confirmed; ESA's terms pages returned 404 (UNVERIFIED snippets suggest editorial use with credit, some items CC BY-SA 3.0 IGO) | ESA; our 2026-11-07 question is still unanswered |
| CGTrader and TurboSquid models (Starlink, Sentinel-5P and others)                                                         | "Royalty Free" store licences (UNVERIFIED): paid, and not for redistributing the file on a public site                                                                   | Don't use                                        |
| NASA Eyes on the Earth assets                                                                                             | Terms not read yet                                                                                                                                                       | NASA                                             |

## Tier C: no usable model found

Nothing usable turned up for OneWeb (651), Kuiper (391), Qianfan (275), Hulianwang (231),
Yaogan (170), Iridium NEXT (80), BeiDou (56), Galileo (32), Planet Flock (~109), Spire Lemur
(~95), Globalstar (36, only the tier B one), Gaofen, Fengyun, Meteosat, MTG, Himawari,
Sentinel-1/2/3, Intelsat, SES or Eutelsat.

The search was by name on Sketchfab only, so this means "not found that way", not "doesn't
exist". Still to search: the Gaia Sky repository, the Celestia Motherlode, Wikimedia Commons
and Printables.

Stand-ins, labelled as stand-ins:

- NASA's Satellite Kit parts, assembled per family.
- NASA's CubeSat models for CubeSat fleets.
- ["Low-poly Satellite Model"](https://plewr.itch.io/low-poly-satellite-model) by plewr, "License
  type: CC0", 59 kB GLB (VERIFIED page; contents not inspected).
- A dot for debris and the long tail.

## Coverage, 2026-11-10

| Source                                       | Objects     | Share of active |
| -------------------------------------------- | ----------- | --------------- |
| Starlink (Malacodart)                        | 11,201      | 66.3%           |
| NASA same-mission models                     | ~53         | 0.3%            |
| GLONASS-M, GPS, Tianhe (if decimation works) | 69          | 0.4%            |
| **Tier A total**                             | **~11,320** | **~67%**        |

Without Starlink, tier A covers only about 1.5% of the other 5,702 objects; those get a stand-in
or stay a dot.

## Budget plan (#202)

No budget has been raised yet: the trial batch (below) leaves the shipped total at 2,671,904 B,
under the existing 3,000,000 B `craftModelTotal`. The per-model budget stays **500 kB** on the
uncompressed shipped file (`craftModelBytes`). The ten models shipped today total 2,159,048 B (VERIFIED, `wc -c` on
`public/models/craft/`; 110 kB to 426 kB each, mean 216 kB) against a `craftModelTotal` of
3,000,000 B. Only the focused object's model is ever loaded, so the total is deploy size, not a
visitor's download.

Proposed ceiling per tier-A model, sized from the shipped mean and the raw sizes above (a
proposal, not a measurement; raw sizes are before decimation):

| Group                                                                                                         | Models | Ceiling each  | Subtotal |
| ------------------------------------------------------------------------------------------------------------- | ------ | ------------- | -------- |
| Tiny meshes: GRACE, Satellite Kit (3 parts), TDRS, GLONASS-M, SWAS                                            | 5      | 25 to 150 kB  | 420 kB   |
| Small: CubeSat 1RU, OCO-2, SORCE, MMS, Aqua, Aura, GOES                                                       | 7      | 150 to 300 kB | 1,800 kB |
| Medium: Terra, Landsat 8, Suomi NPP, ICESat-2, SDO, Fermi, Chandra, THEMIS, CYGNSS, Jason, Jason CS, GPM, GPS | 13     | 350 kB        | 4,550 kB |
| Large, the models people click: ISS, Hubble, Starlink, Tianhe                                                 | 4      | 400 to 450 kB | 1,700 kB |

That is 29 slots and a ceiling of 8,470 kB; the shipped mean (216 kB) suggests about 6 to 7 MB
in practice. Adding the ten shipped models, the provisional tier-A `craftModelTotal` was **9 MB**.

**Trial batch, measured 2026-11-11** (ISS 175,712 B, Hubble 174,404 B, Terra 162,740 B; 512,856 B
together, mean 171 kB, against proposed ceilings of 400 to 450 kB for ISS and Hubble and 350 kB for
Terra). The proposed ceilings were about 2.3 times too high for these three. Their sizes track
triangle count (about 11 to 23 B per triangle, textures included), so a model near 14k triangles
costs 160 to 190 kB. Projecting the other 26 slots at the shipped mean (216 kB) gives 5.6 MB, at the
trial mean (174 kB) 4.5 MB; adding the ten shipped models (2.16 MB) and the three trial models
(0.52 MB) gives **7.2 to 8.3 MB**. Recommendation: **8.5 MB** for the tier-A total (the upper projection
rounded up, as a tripwire), down from the provisional 9 MB, raised in the commit that brings the total past 3 MB, not before. Starlink
(19,644 faces, textured) is the one model that could land above the mean; measure it before
settling. Nothing is raised now: the three models fit in the existing 3 MB.

### Status on #194's checklist, 2026-11-11

Proposed wording for the issue's "NASA models" item (the issue is not edited from here):

- [x] ISS (B), Hubble (A), Terra: built, gated and registered (trial batch).
- [ ] TDRS, Aqua, Aura, Landsat 8/9, GOES, Suomi NPP and the smaller missions in the catalog.
- [ ] Starlink (Malacodart): not downloaded or measured yet; it is the one model that could exceed
      the trial mean size.

## Open risks

1. The biggest win rests on one artist's CC BY model of Starlink. It needs a size test under the
   budget, a look for logos and a visual check.
2. NASA's guidelines don't mention modifying files; the README says "without copyright". This is
   the position we already took for the 10 craft.
3. Only the ten shipped before the gate and the trial batch's three are checked for logos (the ten
   as "unrecorded"). Every other model needs its textures viewed before it ships.
4. NASA's pages list a person or a company as "Source" (Hubble (A): DigitalSpace Corporation). The
   credit repeats it; the rights position is still the README's "free and without copyright".
