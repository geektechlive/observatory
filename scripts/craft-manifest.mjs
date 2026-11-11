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
function nasaRepo({ folder, file, sha256, family, triangles, logos, transforms, outputSha256 }) {
  return {
    sources: [{ file, sha256 }],
    sourceUrl: `${NASA_REPO}/tree/${NASA_SHA}/3D%20Models/${encodeURIComponent(folder)}`,
    sourceVersion: NASA_SHA,
    licence: NASA_LICENCE,
    licenceEvidence: NASA_REPO_EVIDENCE,
    family,
    logosChecked: { date: NASA_REPO_LOGOS_DATE, result: 'clean', detail: logos },
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
      dropNodes: ['bendedtru1', 'bendedtru2', 'bendedtru3', 'bendedtrus', 'pCylinder1', 'pCylinder2', 'pCylinder8'],
    },
    outputSha256: 'e07333d387c913060a0f76202c2cfa10c9dcf627d28bf944f3a7ee8d45b3162e',
    logos:
      'No texture images in the file (19 plain grey materials). Read NASA\'s preview render and real-GPU renders from five angles: no insignia, flag or logo, modelled or painted.',
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
      'No texture images shipped in the file: it names two external TGAs (Side_Panels_TERRA, solarpanels) that are not in NASA\'s repository, so the build drops them and keeps material colours; whatever they carried is not in the model. Read NASA\'s preview render and real-GPU renders from five angles: plain colours, no insignia, flag or logo, modelled or painted.',
  }),
}
