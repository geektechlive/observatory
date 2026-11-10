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
  Draco-compress every model at build time).
- Under the 500 kB per-model budget after compression (`check-bundle`'s `craft-model-bytes`).
- No agency logos or insignia (CLAUDE.md). Check the mesh and its textures, not only the
  thumbnail.
- Credit as the licence asks, in the same shape as `craftModels.ts` (credit line plus source URL).

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
- **Take NASA models from GitHub or science.nasa.gov, not from NASA's Sketchfab uploads.** Those
  are labelled CC BY-NC (for example Hubble), which contradicts the README.
- Credit: "NASA" plus the model page's own Source field (for example "NASA/Ames Research
  Center"), and the page URL.

## Tier A: usable now

### NASA models

From `https://github.com/nasa/NASA-3D-Resources/tree/master/3D%20Models/<name>`. Raw GLB sizes
are from the repository tree (VERIFIED); compressed sizes are not measured yet. No mesh has been
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
`"<title>" by <author>, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/), <model URL>; simplified and compressed for this site.`
All are artists' models, not the operators'. Downloading needs a free Sketchfab login.

| Model                                                                                                                                   | Covers            | Faces     | Notes                                                                                                                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ["Starlink Spacex Satellite"](https://sketchfab.com/3d-models/starlink-spacex-satellite-0a60f6720c5141c9a1c6d71aac108b31) by Malacodart | Starlink (11,201) | 19,644    | Author: "You can use the model for personal and commercial purposes, just remember to add credit". Early flat-panel design. No logo in the thumbnail; mesh and textures not checked. Size after compression not measured |
| ["GLONASS-M"](https://sketchfab.com/3d-models/glonass-m-9660a3d4b72f47c2adde1be1d209b6bc) by tashtego                                   | GLONASS (28)      | 2,382     | Not inspected                                                                                                                                                                                                            |
| [Tianhe core module](https://sketchfab.com/3d-models/a1ee21cce5174f4e9349bfaa4e164a05) by 博格博士 (BGBS)                               | Tiangong core (1) | 104,116   | Untextured; panels not deployed; Wentian and Mengtian missing; needs decimation                                                                                                                                          |
| ["GPS Satellite"](https://sketchfab.com/3d-models/gps-satellite-2266e391d66144e2bd676ea16c449dc0) by ABC Almaty                         | GPS (40)          | 1,942,918 | Needs heavy decimation; a "maybe"                                                                                                                                                                                        |

## Tier B: a model exists, but the licence is a problem

| Item                                                                                                                      | Problem                                                                                                                                                                  | Who to ask                                       |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| [Starlink 2022 scan](https://sketchfab.com/3d-models/starlink-satellite-2022-70361e8f586e44e795d0b27220fe402a) (Acidance) | CC BY-NC-SA: share-alike on our compressed copy                                                                                                                          | The author                                       |
| Glonass K1 (Ilya)                                                                                                         | CC BY-NC-ND: no derivatives, so no compression                                                                                                                           | The author                                       |
| Metop (erkin.yaron, a scan)                                                                                               | CC BY-NC-SA                                                                                                                                                              | The author                                       |
| ISS models on Sketchfab (several)                                                                                         | ND or NC-ND                                                                                                                                                              | Not needed: NASA's ISS is tier A                 |
| NASA's own Sketchfab uploads                                                                                              | CC BY-NC there, unlike the GitHub copies                                                                                                                                 | Use the GitHub copies                            |
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

## Open risks

1. The biggest win rests on one artist's CC BY model of Starlink. It needs a size test under the
   budget, a look for logos and a visual check.
2. NASA's guidelines don't mention modifying files; the README says "without copyright". This is
   the position we already took for the 10 craft.
3. No model has been checked inside for logos yet.
