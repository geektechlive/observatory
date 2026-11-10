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
- Credit: "NASA" plus the model page's own Source field (for example "NASA/Ames Research
  Center"), and the page URL.

## Tier A: usable now

### NASA models

From `https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/<name>`. Raw GLB sizes
are from the repository tree (VERIFIED); built sizes are not measured yet. No mesh has been
checked for logos yet.

| Model                              | Covers                                         | Raw GLB                                 | Notes                                                       |
| ---------------------------------- | ---------------------------------------------- | --------------------------------------- | ----------------------------------------------------------- |
| ISS (A) / ISS (B)                  | ISS (3 rows: Zarya, Nauka, Poisk)              | 39.7 kB / 477 kB                        | Credit "NASA/Ames Research Center"; (D) is 95.9 MB, too big |
| Hubble Space Telescope (A)         | HST                                            | 1.69 MB                                 |                                                             |
| TDRS (A), (B), (E)                 | TDRS (8)                                       | 96.8 kB, 976 kB, 217 kB                 | Generations differ; one model for all is approximate        |
| Terra                              | Terra                                          | 2.15 MB                                 |                                                             |
| Aqua (B)                           | Aqua                                           | 1.10 MB                                 |                                                             |
| Aura (A)                           | Aura                                           | 476 kB                                  |                                                             |
| Landsat 8                          | Landsat 8, 9                                   | 780 kB                                  | Landsat 9 as a near twin is UNVERIFIED                      |
| Suomi NPP                          | Suomi NPP; look-alike for NOAA 20, 21          | 2.28 MB                                 |                                                             |
| GOES                               | GOES 14–19 (6)                                 | 336 kB                                  | Which generation it shows is UNVERIFIED                     |
| ICESat-2 (A)                       | ICESat-2                                       | 1.5 MB                                  |                                                             |
| OCO-2                              | OCO-2                                          | 280 kB                                  |                                                             |
| SORCE, SDO, Fermi, SWAS, Chandra   | 1 each                                         | 366 kB, 498 kB, 1.38 MB, 150 kB, 999 kB |                                                             |
| MMS (A)                            | MMS 1–4                                        | 336 kB                                  |                                                             |
| THEMIS                             | THEMIS A, D, E                                 | 683 kB                                  |                                                             |
| CYGNSS                             | CYGNSS (7)                                     | 1.62 MB                                 |                                                             |
| GRACE (A)                          | GRACE-FO 1, 2 (look-alike, predecessor design) | 22.6 kB                                 |                                                             |
| Jason-1 / OSTM                     | Jason-3 (look-alike)                           | 593 kB / 925 kB                         |                                                             |
| Jason CS                           | Sentinel-6A, 6B                                | 2.1 MB                                  | Same family                                                 |
| GPM                                | GPM Core                                       | 2.26 MB                                 |                                                             |
| CubeSat 1RU, 2RU, ICECube, MiRaTa  | Generic stand-in for CubeSat fleets            | 149–445 kB                              | Flock and Lemur are 3U, so approximate                      |
| Satellite Kit (body, wings, radio) | Generic stand-in for any bus                   | 3–15 kB each                            | Assembled by us, as for New Horizons                        |

About 53 active objects have a same-mission NASA model (including 8 look-alikes): few by count,
but they are the named objects people click.

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

No budget has been raised yet. The per-model budget stays **500 kB** on the uncompressed shipped file
(`craftModelBytes`). The ten models shipped today total 2,159,048 B (VERIFIED, `wc -c` on
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
in practice. Adding the ten shipped models, the provisional tier-A `craftModelTotal` is **9 MB**. It is not
applied yet. **Before raising `craftModelTotal`, build a trial batch of 3**
(for example ISS, Starlink and one medium NASA model), measure their real built sizes, and set
the total from those; raise it only in the commit that adds the models (ADR 0007).

## Open risks

1. The biggest win rests on one artist's CC BY model of Starlink. It needs a size test under the
   budget, a look for logos and a visual check.
2. NASA's guidelines don't mention modifying files; the README says "without copyright". This is
   the position we already took for the 10 craft.
3. No model has been checked inside for logos yet.
