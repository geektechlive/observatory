/**
 * The manifest of the orrery's 3D models (#202): one entry per file in
 * public/models/craft/, keyed by output name. Data only, no imports, so tests and the
 * build both read it. Rules, fields and the checklist for adding a model:
 * docs/reference/satellite-models.md. The gate that enforces it: scripts/craft-gate.mjs.
 *
 * A complete entry has:
 *   sources[]        { file, sha256 } per downloaded source file; the build checks each hash
 *   sourceUrl        the page the model came from
 *   sourceVersion    the version, release or retrieval date of that download
 *   licence          the licence, short
 *   licenceEvidence  { text, url }: the words that grant it, and where they are
 *   family           the satellite family or craft group the model stands for
 *   logosChecked     { date, result: 'clean' } after reading the mesh and its textures
 *   triangles        the triangle budget the build simplifies to
 *
 * `legacy` marks the ten models shipped by #115, before the gate existed. Their source
 * downloads are not kept, so sources[].sha256 is null, sourceVersion and logosChecked are
 * unrecorded, and the build will not promote them. `legacy.outputSha256` pins the bytes
 * shipped today, so a test notices if one changes. To rebuild one: download the source,
 * fill in the real hash, version and logo check, and delete `legacy`.
 */

const NASA_LICENCE = 'NASA media usage guidelines (not subject to copyright; credit NASA)'
// Quoted from the header of src/lib/orrery/craftModels.ts, which cites this page; the page
// itself was not re-read for #202.
const NASA_EVIDENCE = {
  text: '3D models "generally are not subject to copyright"; "NASA should be acknowledged as the source"',
  url: 'https://www.nasa.gov/nasa-brand-center/images-and-media/',
}
const RES = 'https://science.nasa.gov/3d-resources'
const LEGACY_REASON =
  'Shipped by #115 before the asset gate; the source download was not kept, so its hash, version and logo check are unrecorded'

/** An entry for a model that shipped before the gate. */
function legacy({ files, sourceUrl, family, triangles, outputSha256 }) {
  return {
    sources: files.map((file) => ({ file, sha256: null })),
    sourceUrl,
    sourceVersion: null,
    licence: NASA_LICENCE,
    licenceEvidence: NASA_EVIDENCE,
    family,
    logosChecked: { date: null, result: 'unrecorded' },
    triangles,
    legacy: { reason: LEGACY_REASON, outputSha256 },
  }
}

// Satellites (#194), from NASA's 3D Resources on GitHub. The downloads are not kept in the
// repository: build from a folder holding the files named below, fetched from the pinned
// commit (raw.githubusercontent.com/nasa/NASA-3D-Resources/<sha>/3D%20Models/<folder>/<file>),
// and the build checks each one against its hash.
const NASA_REPO = 'https://github.com/nasa/NASA-3D-Resources'
const NASA_SHA = '11ebb4ee043715aefbba6aeec8a61746fad67fa7'
const NASA_REPO_EVIDENCE = {
  text: 'README: "These assets are free and without copyright."',
  url: `${NASA_REPO}/blob/${NASA_SHA}/README.md`,
}
const NASA_REPO_LOGOS_DATE = '2026-11-11'

/** An entry for a model built from a file in NASA-3D-Resources at the pinned commit. */
function nasaRepo({
  folder,
  file,
  sha256,
  parts,
  family,
  triangles,
  logos,
  logosDate = NASA_REPO_LOGOS_DATE,
  transforms,
  outputSha256,
}) {
  return {
    // One source file, or `parts` ({ file, sha256 } each) for a model assembled from several.
    sources: parts ?? [{ file, sha256 }],
    sourceUrl: `${NASA_REPO}/tree/${NASA_SHA}/3D%20Models/${encodeURIComponent(folder)}`,
    sourceVersion: NASA_SHA,
    licence: NASA_LICENCE,
    licenceEvidence: NASA_REPO_EVIDENCE,
    family,
    logosChecked: { date: logosDate, result: 'clean', detail: logos },
    triangles,
    // The build-time edits (the same object as in scripts/craft-sources.mjs; a test fails when
    // they differ) and the hash of the shipped bytes. A rebuild changes the bytes, so it must
    // update outputSha256 here on purpose: the build prints the new one.
    transforms,
    outputSha256,
  }
}

export const MANIFEST = {
  voyager: legacy({
    files: ['voyager.glb'],
    sourceUrl: `${RES}/voyager-probe-a/`,
    family: 'voyager',
    triangles: 14_000,
    outputSha256: '1772f3fc841af7b54cc19cbdc6be95d84fac06bb403d19c51e50d5deecea2a4a',
  }),
  parker: legacy({
    files: ['parker.glb'],
    sourceUrl: `${RES}/parker-solar-probe/`,
    family: 'parker',
    triangles: 14_000,
    outputSha256: 'fca4ec7aea57abf0123018113bfaf52478835f718274f3b6d9feb9e1269b5995',
  }),
  juno: legacy({
    files: ['juno.glb'],
    sourceUrl: `${RES}/juno-b/`,
    family: 'juno',
    triangles: 14_000,
    outputSha256: '3f487e6dd7652407287ff4907a02154e055a0cdd8d481a3dff4abd59e6fa7e19',
  }),
  dscovr: legacy({
    files: ['dscovr.glb'],
    sourceUrl: `${RES}/deep-space-climate-observatory-dscovr-triana/`,
    family: 'dscovr',
    triangles: 9_000,
    outputSha256: '6700e90f4854fb3fdb8f7f89ccb89429ba0869218c99f8ec7fedabfb09d34725',
  }),
  soho: legacy({
    files: ['soho.glb'],
    sourceUrl: 'https://github.com/nasa/NASA-3D-Resources',
    family: 'soho',
    triangles: 14_000,
    outputSha256: 'a4137071aff3a96eb115b9ed0eba191152f3736e7f6a123158a47efb58ad98f3',
  }),
  wind: legacy({
    files: ['wind.glb'],
    sourceUrl: `${RES}/wind/`,
    family: 'wind',
    triangles: 14_000,
    outputSha256: '02c3c5b832411809489834f23e6bb1183be1638c9d55102362aed2f49904d3f8',
  }),
  ace: legacy({
    files: ['ace.glb'],
    sourceUrl: `${RES}/advanced-composition-explorer/`,
    family: 'ace',
    triangles: 14_000,
    outputSha256: 'f8eac73bd5b611dec3b6d161f095ef9921a7052045516ec9bae772e368963122',
  }),
  jwst: legacy({
    files: ['jwst.glb'],
    sourceUrl: `${RES}/james-webb-space-telescope-b/`,
    family: 'jwst',
    triangles: 16_000,
    outputSha256: 'e4c6f9876d7b1635d1fc0e568913c01592d224a55fd31c8e1ac8cc1220c97546',
  }),
  // Shipped at 23,966 triangles (counted from the file), over the 16,000 target the build
  // aims at: its parts are too many and small for the simplifier. Before completing this
  // entry, set `triangles` to a budget the file actually meets.
  clipper: legacy({
    files: ['clipper.glb'],
    sourceUrl: 'https://science.nasa.gov/resource/europa-clipper-3d-model/',
    family: 'europa-clipper',
    triangles: 16_000,
    outputSha256: '4898a2d6c321748695f46ed5d44ad2bd809fa561368834b664e6c361c9d93d8a',
  }),
  // Assembled from NASA's 3D-printing parts (arrangement approximate); see
  // buildNewHorizons in craft-models.mjs for the three STL files it reads.
  'new-horizons': legacy({
    files: ['nh_7399_05_rp_body.stl', 'nh_7399_05_rp_antenna.stl', 'nh_7399_05_rp_rtg.stl'],
    sourceUrl: `${RES}/new-horizons/`,
    family: 'new-horizons',
    triangles: 12_000,
    outputSha256: '83e3d3e5da0ae1898c77b55068d500bb05b0a272c990cca677828c409a24e5b3',
  }),
  iss: nasaRepo({
    folder: 'International Space Station (ISS) (B)',
    file: 'International Space Station (ISS) (B).glb',
    sha256: '2ba4427413b0dd89a33d2acaf962dea8a96a3b1d8dceda05cc7aad547ffd3d16',
    family: 'iss',
    // 174,440 in the source. The simplifier overshoots its target on this model; see `aim` in
    // craft-models.mjs. The build lands at about 14.1k, after dropping seven stray
    // discs (dropNodes in craft-models.mjs; docs/reference/satellite-models.md).
    triangles: 14_000,
    transforms: {
      aim: 11_700,
      dropNodes: [
        'bendedtru1',
        'bendedtru2',
        'bendedtru3',
        'bendedtrus',
        'pCylinder1',
        'pCylinder2',
        'pCylinder8',
      ],
    },
    outputSha256: 'e07333d387c913060a0f76202c2cfa10c9dcf627d28bf944f3a7ee8d45b3162e',
    logos:
      "No texture images in the file (19 plain grey materials). Read NASA's preview render and real-GPU renders from five angles: no insignia, flag or logo, modelled or painted.",
  }),
  hubble: nasaRepo({
    folder: 'Hubble Space Telescope (A)',
    file: 'Hubble Space Telescope (A).glb',
    sha256: 'e5ba4de15c7d359ac8fa1ab7e286aff42dec09c0fadae3db99252587f39fa384',
    family: 'hubble',
    // The source has 7,672 triangles, under the 9k to 16k of the other craft: nothing to simplify.
    triangles: 7_672,
    transforms: { blank: [{ texture: 'hbltel_w', x: 128, y: 416, w: 34, h: 18 }] },
    outputSha256: '7fcdf6f3bbe431ad278463b2b98c985a0ca879caadb3a939eaf4b45f87e6a396',
    logos:
      'Five 512 px textures (WebP, each with a PNG fallback of the same picture) viewed in full, the label areas enlarged. Panel sheets, instrument-bay plates (four 20 x 8 px serial plates, text unreadable), array cells, aperture and aft bulkhead. One 25 x 10 px plate on the aft bulkhead shows "30" beside a glyph about 6 px across that could not be identified even in the lossless fallback, so the build paints that plate out (blank, in craft-models.mjs) and the shipped texture was viewed again. No meatball, worm, patch, flag or company logo. Real-GPU renders from five angles: none.',
  }),
  terra: nasaRepo({
    folder: 'Terra',
    file: 'Terra.glb',
    sha256: '8794857595f7a7d416184fe926ecb50e11bf267dbe471d1cf2728a85e8d017fa',
    family: 'terra',
    triangles: 14_000,
    transforms: { dropExternalImages: true },
    outputSha256: 'd6611f775706e6b5d7a7caf41ea173c1a1440100ee2379b31b3ec693733bfba1',
    logos:
      "No texture images shipped in the file: it names two external TGAs (Side_Panels_TERRA, solarpanels) that are not in NASA's repository, so the build drops them and keeps material colours; whatever they carried is not in the model. Read NASA's preview render and real-GPU renders from five angles: plain colours, no insignia, flag or logo, modelled or painted.",
  }),
  // Second batch (#194). TDRS is two designs: the first generation (TDRS 1 to 7, a box bus with
  // two long arrays and two mesh dishes) and the later Boeing-bus satellites (TDRS 8 to 13,
  // hexagonal bus, square arrays, gold dishes). Each model is shown for its own generation.
  'tdrs-gen1': nasaRepo({
    folder: 'Tracking and Data Relay Satellites (TDRS) (B)',
    file: 'Tracking and Data Relay Satellites (TDRS) (B).glb',
    sha256: 'ece0a822767ff7f4cde2a2c5cc5042fa4740528bdbb59095a32b049377f70f30',
    family: 'tdrs',
    triangles: 14_000,
    transforms: {},
    outputSha256: '4a4df9bfdca2cd318718ddd374bf142714d654ac096347e17ffa978384d7d3c6',
    logos:
      "Three textures: a 192 px radial gradient, a 256 px silver foil ramp and a 1024 px sheet (array cells, a perforated panel, a feed horn, a grey cylinder, a dark panel and feed elements), each with a PNG fallback of the same picture. The cylinder carries light and dark rectangles where labels were painted over before NASA published the file; a strip on the dark panel, contrast-stretched 8x, holds no resolvable glyph. NASA's preview render viewed. Real-GPU renders of the shipped file along all six axes, and close-ups of anything label-like: no insignia, meatball, worm, patch, flag or company logo, modelled or painted.",
  }),
  'tdrs-gen2': nasaRepo({
    folder: 'Tracking and Data Relay Satellites (TRDS) (E)',
    file: 'Tracking and Data Relay Satellites (TRDS) (E).glb',
    sha256: '4508756798d827722608aa9001925f01ce6409b9e0fd910eacfde9c061139b9e',
    family: 'tdrs',
    triangles: 14_000,
    transforms: { aim: 12_000 },
    outputSha256: '50a6085c17ad6a4199108e61674b75bc77d4a50870bdd22a933d7bae533258f9',
    logos:
      "No texture images in the file (33 plain materials). NASA's preview render viewed. Real-GPU renders of the shipped file along all six axes, and close-ups of anything label-like: no insignia, meatball, worm, patch, flag or company logo, modelled or painted.",
  }),
  goes: nasaRepo({
    folder: 'Geostationary Operational Environmental Satellites',
    file: 'Geostationary Operational Environmental Satellites.glb',
    sha256: 'e2f690d3d59e101d6a75a8b0bdcbe1cf9f58a058d01eaceede8557460a6e9101',
    family: 'goes',
    triangles: 14_000,
    transforms: {},
    outputSha256: '5773008fc0d08263424e4f4212795f2a221f3006ae20be751a479c2ed1c78686',
    logos:
      'No texture images in the file (24 plain materials); NASA publishes no preview render for it. A row pattern on the array that looked like lettering at full view is solar-cell squares, checked at 3x. Real-GPU renders of the shipped file along all six axes, and close-ups of anything label-like: no insignia, meatball, worm, patch, flag or company logo, modelled or painted.',
  }),
  landsat8: nasaRepo({
    folder: 'Landsat 8',
    file: 'Landsat 8.glb',
    sha256: '8b599e867be20589cd35e55ed1d46da104299b430b1827b548a25d3fad0a314d',
    family: 'landsat',
    triangles: 14_000,
    transforms: { aim: 8_000 },
    outputSha256: 'f466e7311e42df04e2698a1e3112b3a62497e9bf57a9a7111781011778743da4',
    logos:
      "No texture images in the file (33 plain materials). NASA's preview render viewed. Real-GPU renders of the shipped file along all six axes, and close-ups of anything label-like: no insignia, meatball, worm, patch, flag or company logo, modelled or painted.",
  }),
  aqua: nasaRepo({
    folder: 'Aqua (B)',
    file: 'Aqua (B).glb',
    sha256: 'f0761181a1d378b6b3e270e8eee8bf20c241b7d577933630369b0cffd4b521e1',
    family: 'aqua',
    triangles: 14_000,
    transforms: { plain: { shiny_panel: [0.18, 0.18, 0.2, 1] } },
    outputSha256: '36feccf8eb489420be491b47b0715722362202f93f4eae7cfc336ca7a67db594',
    logos:
      "Four textures, each with a PNG fallback of the same picture: a 1024 px sheet (array cells, a cable-run panel, foil, a grey panel, a cylinder and a small bracket, enlarged 6x), a 512 px foil normal map and two 256 px foil ramps. The source draws one panel material ('shiny_panel') with the normal map as its colour, which drew the back of the array as blue-violet crinkles; the build draws that material plain dark grey (plain, in craft-sources.mjs). NASA's preview render viewed. Real-GPU renders of the shipped file along all six axes, and close-ups of anything label-like: no insignia, meatball, worm, patch, flag or company logo, modelled or painted.",
  }),
  aura: nasaRepo({
    folder: 'Aura (A)',
    file: 'Aura (A).glb',
    sha256: '99d46cd9af551c7511befe47d3f24b9b957da6a9dc35a0e29fc784db9f55b381',
    family: 'aura',
    triangles: 6_135,
    transforms: {},
    outputSha256: 'd322027afb88206e0f2248eb60d24132ba3522ab4d33556164f8969461329f11',
    logos:
      "One 1024 px texture atlas (a WebP and a JPEG of the same picture): foil, panels, dishes, array cells; the right-hand rows enlarged 3x. NASA's preview render viewed. Real-GPU renders of the shipped file along all six axes, and close-ups of anything label-like: no insignia, meatball, worm, patch, flag or company logo, modelled or painted.",
  }),
  'suomi-npp': nasaRepo({
    folder: 'Suomi National Polar-orbiting Partnership (Suomi NPP)',
    file: 'Suomi National Polar-orbiting Partnership (Suomi NPP).glb',
    sha256: '885278277ed8fa864368803b7da2046292754bff01033055d56fe86e8b951ee4',
    family: 'jpss',
    triangles: 4_024,
    transforms: {},
    outputSha256: 'b41799de2f48ed884c33de93fc530288dd38155d1d4c246629902a50a4a2cfd6',
    logos:
      'Five textures, each with a PNG fallback of the same picture: two 1024 px sheets of hardware photographs (array, cable-run panel, foil, radiators, instrument panels), a 1024 px ambient-occlusion map and two 256 px foil ramps. NASA publishes no preview render for it. Real-GPU renders of the shipped file along all six axes, and close-ups of anything label-like: no insignia, meatball, worm, patch, flag or company logo, modelled or painted.',
  }),
  // Third batch (#194).
  oco2: nasaRepo({
    folder: 'Orbiting Carbon Observatory (OCO) 2',
    file: 'Orbiting Carbon Observatory (OCO) 2.glb',
    sha256: '5aba302aaf91fe1a915f1121683aca6ef7ad65d7a82dad65f363361e5009b1ef',
    family: 'oco',
    triangles: 14000,
    transforms: {},
    outputSha256: '26acfb93c52190ecd0d8fb5e9f53b476ce3c5e35dfe273d7e43f30ed7b1fa450',
    logos:
      "No texture images in the file (23 plain materials). NASA's preview render viewed. Real-GPU renders of the shipped file along all six axes, and close-ups of anything label-like: no insignia, meatball, worm, patch, flag or company logo, modelled or painted.",
  }),
  sorce: nasaRepo({
    folder: 'Solar Radiation and Climate Experiment (SORCE)',
    file: 'Solar Radiation and Climate Experiment (SORCE).glb',
    sha256: '8ec505080199227d25897f5157f4cd87e60092d69b16079deb3ca32caa2ce10d',
    family: 'sorce',
    triangles: 14000,
    transforms: {},
    outputSha256: '60f2bcb37abedcb48547e7ab08f5a6c7f8391fc9f7122bb90967a91179b2c3a7',
    logos:
      'No texture images in the file (29 plain materials). NASA publishes no preview render or page for it. Three pink plates on an end face, rendered close, are connectors. Real-GPU renders of the shipped file along all six axes, and close-ups of anything label-like: no insignia, meatball, worm, patch, flag or company logo, modelled or painted.',
  }),
  sdo: nasaRepo({
    folder: 'Solar Dynamics Observatory',
    file: 'Solar Dynamics Observatory.glb',
    sha256: '8ce4607bd65f098eee22f02717a182d6721610c940a961511dfbca832a3eda95',
    family: 'sdo',
    triangles: 14000,
    transforms: { aim: 6_000 },
    outputSha256: 'd9aa7e65c4c149c0201b60cbae1f85940ad62cbedd73ca73c778bbe237b35c97',
    logos:
      "No texture images in the file (31 plain materials). NASA's preview render viewed. Real-GPU renders of the shipped file along all six axes, and close-ups of anything label-like: no insignia, meatball, worm, patch, flag or company logo, modelled or painted.",
  }),
  swas: nasaRepo({
    folder: 'Submillimeter Wave Astronomy Satellite (SWAS)',
    file: 'Submillimeter Wave Astronomy Satellite (SWAS).glb',
    sha256: 'c1d58e66cb2f1185fc98b5941cbfeb3dbdb453b817a87f95e6bf8d176630f5a1',
    family: 'swas',
    triangles: 12908,
    transforms: {},
    outputSha256: 'b4376a1d27b2f9f08cfb096da79d45d5e7c5a4d4d06fef71b60b928bdc2df4a6',
    logos:
      'No texture images in the file (20 plain materials). NASA publishes no preview render for it. Real-GPU renders of the shipped file along all six axes, and close-ups of anything label-like: no insignia, meatball, worm, patch, flag or company logo, modelled or painted.',
  }),
  chandra: nasaRepo({
    folder: 'Chandra X-ray Observatory',
    file: 'Chandra X-ray Observatory.glb',
    sha256: '9383f44fc4c6eba73c40b0c2cfe33c08c90f1fb5230274bfdaa98e0c9f116a34',
    family: 'chandra',
    triangles: 14000,
    transforms: { blank: [{ texture: 'chandra_tex_01', x: 6, y: 638, w: 52, h: 96 }] },
    outputSha256: '04412979c7569c0a270594cd939fd4e5bd7e450380bc454477ebb6e4b40885a6',
    logos:
      'Three textures, each with a PNG fallback of the same picture: two 256 px foil ramps and a 1024 px sheet (aperture, array cells, a cable-run panel, a mechanism photograph, a cylinder, panels). One small photographed part on the sheet carries a label with a blue band and blurred lines of text, enlarged 6x, unreadable and with no symbol that could be identified; the build paints it out (blank, in craft-sources.mjs). NASA publishes no preview render for it. Real-GPU renders of the shipped file along all six axes, and close-ups of anything label-like: no insignia, meatball, worm, patch, flag or company logo, modelled or painted.',
  }),
  mms: nasaRepo({
    folder: 'Magnetospheric Multiscale (MMS) (A)',
    file: 'Magnetospheric Multiscale (MMS) (A).glb',
    sha256: 'e3688a8db82f1918c3b4525f4ceed08b614a3a2c5be09ade5711baba30262eef',
    family: 'mms',
    triangles: 14000,
    transforms: {},
    outputSha256: 'ea157869f01c79ee1876e838c164c45f2226f5b6195d760a90b27d74040471c8',
    logos:
      "No materials and no texture images in the file: it draws in the default grey. NASA's preview render viewed. Real-GPU renders of the shipped file along all six axes, and close-ups of anything label-like: no insignia, meatball, worm, patch, flag or company logo, modelled or painted.",
  }),
  themis: nasaRepo({
    folder: 'Time History of Events and Macroscale Interactions During Substorms (THEMIS)',
    file: 'Time History of Events and Macroscale Interactions During Substorms (THEMIS).glb',
    sha256: '2dfe2a2e07de211f6686adbb612c09c5dfac62a397cb88343f119c2124d818e3',
    family: 'themis',
    triangles: 11424,
    transforms: {},
    outputSha256: 'feb10186e168f839f088f97eeee75881cb5553d3bc9b92cbca31b5d760c0ad60',
    logos:
      'Three textures, each with a PNG fallback of the same picture: two 256 px foil ramps and a 1024 px sheet (foil, array cells, panels). NASA publishes no preview render for it. Real-GPU renders of the shipped file along all six axes, and close-ups of anything label-like: no insignia, meatball, worm, patch, flag or company logo, modelled or painted.',
  }),
  cygnss: nasaRepo({
    folder: 'Cyclone Global Navigation Satellite System (CYGNSS)',
    file: 'Cyclone Global Navigation Satellite System (CYGNSS).glb',
    sha256: '830321f2d30099b4355f835d7ae5a2ab1f9f91c292dd01dfc008b8d4bf64c962',
    family: 'cygnss',
    triangles: 7338,
    transforms: {},
    outputSha256: '56f2cb3575c2f46e1376653aada313a7f407d995b4704a1bc75bae7aabf06132',
    logos:
      'One 2048 px texture sheet (a WebP and a PNG of the same picture): array cells, antenna patches, radiators, panels, hardware. NASA publishes no preview render for it. Real-GPU renders of the shipped file along all six axes, and close-ups of anything label-like: no insignia, meatball, worm, patch, flag or company logo, modelled or painted.',
  }),
  grace: nasaRepo({
    folder: 'Gravity Recovery and Climate Experiment (GRACE) (B)',
    file: 'Gravity Recovery and Climate Experiment (GRACE) (B).glb',
    sha256: '33382f0069d7e84de6d3747a723c2e0ded2cbaf83185d89bdf82c5ca58e1fef1',
    family: 'grace',
    triangles: 3961,
    transforms: { plain: { 'underside.001': [0.83, 0.66, 0.35, 1] } },
    outputSha256: '7dac8c419c24253a7c77401a099b3b713b0eaf8057e837f454de5638c09fd0a6',
    logos:
      "Two textures, each with a PNG fallback of the same picture: a 1024 px sheet (array cells and a ring) and a 720 x 480 px normal map, which the source also uses as the colour of one underside material ('underside.001'), drawing it magenta; the build draws that material in the gold of the other underside (plain, in craft-sources.mjs). A relief on the large end-face disc, rendered close, is a crossed-dipole antenna pattern. NASA's preview render viewed. Real-GPU renders of the shipped file along all six axes, and close-ups of anything label-like: no insignia, meatball, worm, patch, flag or company logo, modelled or painted.",
  }),
  jason2: nasaRepo({
    folder: 'Ocean Surface Topography Mission (OSTM Jason-2)',
    file: 'Ocean Surface Topography Mission (OSTM Jason-2).glb',
    sha256: '61c58c2b1c9afce77186a781f699aad5b026573b2cb52e4476d7afd57eae2d04',
    family: 'jason',
    triangles: 14000,
    transforms: {},
    outputSha256: '9726518172d6404b908c202cb881d560e5c3df8832cd5b16380eeb0e64b5dd57',
    logos:
      'One 1024 px gold-foil photograph (a WebP and a JPEG of the same picture). NASA publishes no preview render for it. Real-GPU renders of the shipped file along all six axes, and close-ups of anything label-like: no insignia, meatball, worm, patch, flag or company logo, modelled or painted.',
  }),
  sentinel6: nasaRepo({
    folder: 'Jason Continuity of Service (Sentinel-6)',
    file: 'Jason Continuity of Service (Sentinel-6).glb',
    sha256: 'cd257b8d63deef018d0227fa6c4bcb29974f257073c4d4f92abd557098b3d580',
    family: 'sentinel-6',
    triangles: 14000,
    transforms: {},
    outputSha256: '8fe5ccc8d7d561e0b6b026f3055f946eb65d495bfa45baa1ce7d963209f7d682',
    logos:
      'Eight textures, each with a fallback of the same picture: foil and corrugation normal maps, an ambient-occlusion atlas, a 2048 px normal map and a 1024 px occlusion map of the antenna deck (hexagon panels, a ring, a star-shaped plate), and a 110 x 62 px array. Normal maps were viewed for embossed lettering too: none. NASA publishes no preview render for it. Real-GPU renders of the shipped file along all six axes, and close-ups of anything label-like: no insignia, meatball, worm, patch, flag or company logo, modelled or painted.',
  }),
  gpm: nasaRepo({
    folder: 'Global Precipitation Measurement',
    file: 'Global Precipitation Measurement.glb',
    sha256: '7068c880770bb2ac936e804a1af48e564c90b829ff884c405a4759e8da9e693e',
    family: 'gpm',
    triangles: 14000,
    transforms: { aim: 9_800, minPart: 0.005 },
    outputSha256: 'b87cccbc9aba54307cb9ecbe49a987255ed445607210e10774cb6cc97f8d4e07',
    logos:
      'No texture images in the file (48 plain materials). NASA publishes no preview render for it. Real-GPU renders of the shipped file along all six axes, and close-ups of anything label-like: no insignia, meatball, worm, patch, flag or company logo, modelled or painted.',
  }),
  fermi: nasaRepo({
    folder: 'Fermi Gamma-ray Large Area Space Telescope',
    file: 'Fermi Gamma-ray Large Area Space Telescope.glb',
    sha256: 'd345f3b0595f7792f699acf33b28d7401cb53cc2a20b735bca00e95644e3813c',
    family: 'fermi',
    triangles: 26000,
    transforms: { aim: 14_000, keep: ['GPMcore-SolarFaces'] },
    outputSha256: '48516a436cc2410e070c2ff81f1ef8b653b294b0912319413863921cc8752661',
    logos:
      'No texture images in the file (27 plain materials). Real-GPU renders of the shipped file along all six axes, and close renders of the body: no insignia, meatball, worm, patch, flag or company logo, modelled or painted.',
  }),
  icesat2: nasaRepo({
    folder: 'Ice, Clouds, and Land Elevation Satellite-2 (ICESat-2) (A)',
    file: 'Ice, Clouds, and Land Elevation Satellite-2 (ICESat-2) (A).glb',
    sha256: 'e7d260d69852fcd3367c8e7a3c236f8c0551c591abc5a8e8f42c0356a2eebf38',
    family: 'icesat',
    triangles: 42000,
    transforms: { aim: 14_000, keep: ['ICESAT2-Solar'] },
    outputSha256: '9b442be269b44ca420408589707f61c5b88987f811caeaf2471f17c96a501c2b',
    logos:
      "No texture images in the file (26 plain materials; 'ICESAT2-instrumentimage' is a plain white material, not a picture). NASA's preview render viewed. Real-GPU renders of the shipped file along all six axes, and close renders of the body: no insignia, meatball, worm, patch, flag or company logo, modelled or painted.",
  }),
  // Fourth batch (#194, tier C): stand-ins for satellites with no model of their own. They
  // are shown only as family stand-ins (modelDescriptor.ts), never as an object's own model.
  cubesat: nasaRepo({
    folder: 'CubeSat - 2 RU Generic',
    file: 'CubeSat - 2 RU Generic.glb',
    sha256: '30633496ef3aea790ec00782772757c78744ccaf08c9322eca380a6c4ad57ec9',
    family: 'cubesat',
    // 36,896 in the source; the build lands at 12,227.
    triangles: 12_000,
    transforms: { aim: 12_000 },
    outputSha256: '388269ffe82ec48712001f7dc9c13a513a39d80768c636fe23c7db080969d6de',
    logosDate: '2026-11-12',
    logos:
      "No texture images in the file (every one of its materials is a plain colour): the solar cells, the plates and the cream strip are geometry. Real-GPU renders of the shipped file from the front, both sides, the back, the top and the bottom, and 4x close renders of the electronics plate at the top of all four faces and of the strip at mid-height on two of them: black and cream hardware blocks, white tabs and a cream wire, with no lettering, number, insignia, meatball, worm, patch, flag or company logo, modelled or painted. NASA's preview render viewed.",
  }),
  // Three Satellite Kit parts, set together by buildGenericBus in craft-models.mjs: the parts
  // share one coordinate frame, so they are placed as NASA's own preview places them, with
  // no scaling or moving by us. There is no `transforms` to record.
  'generic-bus': nasaRepo({
    folder: 'Satellite Kit',
    parts: [
      {
        file: 'Satellite Kit body 1.glb',
        sha256: '169428dc5a8bdf748f71f7b0c85124a9e52194fb5bbaf7e43811fbc30f9727ea',
      },
      {
        file: 'Satellite Kit wings 2.glb',
        sha256: 'b4b6d84ad0356a83dcbe640fda5a1c603c024e84591a65f650f662d3ef34bed1',
      },
      {
        file: 'Satellite Kit radio 2.glb',
        sha256: '1d39f09fe11ca15f041e0ddb99b35360bcf37d649d8b3feca729ff89bed39ad4',
      },
    ],
    family: 'generic-bus',
    triangles: 1_100,
    transforms: {},
    outputSha256: 'b879d208587165fd61abbcc34f91729595347ea7055a42cef7cd666f65cf7dd5',
    logosDate: '2026-11-12',
    logos:
      "No texture images in any of the three files (plain colour materials: a grey cylinder, blue wings, a yellow and a white box, white dishes). NASA's preview render of the kit viewed. Real-GPU renders of the shipped file from the front, a side, the back, the top and the bottom: no lettering, insignia, meatball, worm, patch, flag or company logo, modelled or painted.",
  }),
}
