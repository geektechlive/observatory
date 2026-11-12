/**
 * How each single-file model is built (#194, #202): data only, no imports, so the unit tests
 * can read it. The manifest (scripts/craft-manifest.mjs) records the same edits per model as
 * `transforms`, and tests/unit/scripts/craft-manifest.test.ts fails when the two differ.
 * Options: aim, error, minPart, textures, blank, dropNodes, plain, dropExternalImages; see
 * scripts/craft-models.mjs for what each does.
 */
/**
 * Output name -> how a single-file model is simplified. The source file and the triangle
 * budget come from the manifest (the one place they are recorded); a model with several
 * source files, New Horizons, is built by its own function.
 */
export const SOURCES = {
  voyager: {},
  parker: {},
  juno: {},
  dscovr: {},
  soho: {},
  wind: {},
  ace: {},
  jwst: {},
  // 35.7 MB, 203k triangles and 43 textures: its maps go (material colours stay) and it
  // gets a looser error to reach the budget.
  // It is thousands of small closed parts the simplifier cannot shrink, so components
  // under 1.5% of a mesh's size (sub-pixel at a focused craft's ~150 px) go first.
  clipper: { textures: false, error: 0.05, minPart: 0.015 },
  // Satellites (#194). Source folders: docs/reference/satellite-models.md.
  // The simplifier lands about 2.3k triangles above its target on this model (a 14k target gave
  // 16.6k, 16.6k gave 19.0k, 20k gave 22.2k; a larger error did not help and minPart deletes real parts), so it is
  // aimed lower than the 14k budget the file then meets.
  // The source also holds seven flat discs (nodes below), 5 units wide, 0.5 thick and stacked
  // 15 units above the station; the real ISS has nothing there and NASA's own preview shows
  // none, so they are dropped (dropNodes). Without them the model's extent is the station's.
  iss: {
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
  // One 25 x 10 px label plate on the aft bulkhead texture carries a small glyph too small to
  // identify, so it is painted out (blankTextures) rather than judged clean.
  hubble: { blank: [{ texture: 'hbltel_w', x: 128, y: 416, w: 34, h: 18 }] },
  // The file names two TGA textures that NASA's repository does not hold, so it is read
  // with its images dropped (glbWithoutExternalImages) and keeps its material colours.
  terra: { dropExternalImages: true },
  // Second batch (#194).
  'tdrs-gen1': {},
  'tdrs-gen2': { aim: 12_000 },
  goes: {},
  landsat8: { aim: 8_000 },
  // The source colours its array back ('shiny_panel') with the foil normal map, so it showed
  // blue-violet crinkles; drawn plain dark grey instead (plainMaterials, craft-nodes.mjs).
  aqua: { plain: { shiny_panel: [0.18, 0.18, 0.2, 1] } },
  aura: {},
  'suomi-npp': {},
  // Third batch (#194).
  oco2: {},
  sorce: {},
  sdo: { aim: 6_000 },
  swas: {},
  chandra: { blank: [{ texture: 'chandra_tex_01', x: 6, y: 638, w: 52, h: 96 }] },
  mms: {},
  themis: {},
  cygnss: {},
  grace: { plain: { 'underside.001': [0.83, 0.66, 0.35, 1] } },
  jason2: {},
  sentinel6: {},
  gpm: { aim: 9_800, minPart: 0.005 },
  // Their solar arrays are hundreds of cell quads: kept whole (craft-simplify.mjs).
  fermi: { aim: 14_000, keep: ['GPMcore-SolarFaces'] },
  icesat2: { aim: 14_000, keep: ['ICESAT2-Solar'] },
  // Fourth batch, the stand-ins (#194, tier C). The generic bus has no entry here: it is
  // assembled from three Satellite Kit files by its own function (buildGenericBus).
  cubesat: { aim: 12_000 },
}
