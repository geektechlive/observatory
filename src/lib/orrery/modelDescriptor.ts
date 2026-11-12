/**
 * One description of a 3D model for anything the orrery can show up close (#202): a
 * spacecraft by NAIF id, a satellite by NORAD id and then by family. The layer and the
 * detail view take a descriptor and never look at where it came from. Rules for adding a
 * model, and the manifest every shipped file needs: docs/reference/satellite-models.md and
 * docs/reference/orrery.md.
 *
 * No three.js here: this module is data and lookups only.
 */
import { type Attitude, CRAFT_MODELS, type CraftModel, type StandInKey } from './craftModels'

/** Whether a model is this object's own, or a stand-in shared by its family. */
export type ModelScope = 'own' | 'family'

interface DescriptorBase {
  /** The credit line shown with the model, in the shape the licence asks for. */
  readonly credit: string
  /** The licence the model is used under, short and human readable. */
  readonly licence: string
  /** A page with the licence's terms, linked from the credit (CC BY asks for one). */
  readonly licenceUrl?: string | undefined
  /** What was changed from the source model, when the licence asks for it ("Simplified for this site."). */
  readonly changes?: string | undefined
  readonly attitude: Attitude
  /** The model-frame axis that points at the attitude target. */
  readonly axis: readonly [number, number, number]
  /** What the attitude means, for the inspector. */
  readonly attitudeNote: string
  readonly scope: ModelScope
}

/** A GLB served from /models/craft/. */
export interface FileDescriptor extends DescriptorBase {
  readonly kind: 'file'
  readonly file: string
  readonly sourceUrl: string
}

/** A simplified model built in code (`craftStandIns.ts`), nothing to download. */
export interface StandInDescriptor extends DescriptorBase {
  readonly kind: 'standin'
  readonly file: null
  readonly standIn: StandInKey
  readonly sourceUrl: null
}

export type ModelDescriptor = FileDescriptor | StandInDescriptor

const NASA_LICENCE = 'NASA media usage guidelines (not subject to copyright; credit NASA)'
// Axes read from each model's frame (the GLB scene, after its own node transforms):
// - ISS: the thin axis, normal to the plane of the truss (Z) and the module stack (Y). The
//   station flies with that axis along the local vertical; which of +X and -X faces Earth
//   was not determined, so the sign is a choice.
// - Hubble: the barrel (and its aperture) is +Y. This model's solar arrays are thin along Y
//   (they sit square to the barrel), so aiming their face at the Sun would aim the aperture
//   at it, which Hubble never does. The axis is X, square to the barrel, so the aperture is
//   never on the Sun line; the arrays are drawn in one fixed position.
// - Terra: its high-gain antenna sits on a boom at +Y, so the instrument side is -Y.
const ISS_AXIS = [1, 0, 0] as const
const HUBBLE_AXIS = [1, 0, 0] as const
const TERRA_AXIS = [0, -1, 0] as const
const OWN_WORK_LICENCE = 'Own work, built in code'

function fromCraftModel(model: CraftModel): ModelDescriptor {
  const common = {
    attitude: model.attitude,
    axis: model.axis,
    attitudeNote: model.attitudeNote,
    scope: 'own',
  } as const
  if (model.kind === 'nasa') {
    return {
      ...common,
      kind: 'file',
      file: model.file,
      sourceUrl: model.sourceUrl,
      credit: model.credit,
      licence: NASA_LICENCE,
    }
  }
  return {
    ...common,
    kind: 'standin',
    file: null,
    standIn: model.standIn,
    sourceUrl: null,
    credit: model.credit,
    licence: OWN_WORK_LICENCE,
  }
}

/** A spacecraft's model by NAIF id (today's table in craftModels.ts), or undefined. */
export function spacecraftDescriptor(naifId: string): ModelDescriptor | undefined {
  const model = CRAFT_MODELS[naifId]
  return model ? fromCraftModel(model) : undefined
}

export type SatelliteModelTable = Readonly<Record<string, ModelDescriptor>>

type NasaSatelliteFields = Pick<
  FileDescriptor,
  'file' | 'sourceUrl' | 'credit' | 'attitude' | 'axis' | 'attitudeNote'
>

/**
 * A NASA 3D Resources model of the very satellite it is filed under (`own`), or of its design
 * or generation, shown for a sibling (`family`).
 */
function nasaSatellite(fields: NasaSatelliteFields, scope: ModelScope = 'own'): FileDescriptor {
  return { ...fields, kind: 'file', licence: NASA_LICENCE, scope }
}

const RES = 'https://science.nasa.gov/3d-resources'

const ISS_MODEL = nasaSatellite({
  file: '/models/craft/iss.glb',
  sourceUrl: `${RES}/international-space-station-iss-b/`,
  credit: 'NASA/Michael D. Carbajal',
  attitude: 'earth',
  axis: ISS_AXIS,
  attitudeNote: 'Truss across the orbit, flat side toward Earth',
})

/** One descriptor filed under several NORAD ids. */
function sharing(ids: readonly string[], model: ModelDescriptor): SatelliteModelTable {
  return Object.fromEntries(ids.map((id) => [id, model]))
}

// TDRS is two designs, each with its own model: the first generation (TDRS 1 to 7) and the
// later Boeing-bus satellites (TDRS 8 to 13). Both models carry the multiple-access array and
// the dish feeds on +Y, the side that faces Earth.
const TDRS_GEN1: NasaSatelliteFields = {
  file: '/models/craft/tdrs-gen1.glb',
  sourceUrl: `${RES}/tracking-and-data-relay-satellites-tdrs-b/`,
  credit: 'NASA/JPL/Eyes on the Solar System',
  attitude: 'earth',
  axis: [0, 1, 0],
  attitudeNote: 'Antenna side toward Earth',
}
const TDRS_GEN2: NasaSatelliteFields = {
  ...TDRS_GEN1,
  file: '/models/craft/tdrs-gen2.glb',
  sourceUrl: `${RES}/tracking-and-data-relay-satellites-trds-e/`,
  credit: 'NASA/Christopher R. Meaney',
}

// The Earth-facing side of these models was not determined from the mesh (#194). Attitude is
// not used for satellites until they are drawn as models in the orrery, and that step must
// set these axes; docs/reference/satellite-models.md lists them.
const PLACEHOLDER_EARTH = {
  attitude: 'earth',
  axis: [0, -1, 0],
  attitudeNote: 'Earth-pointing (model axis not yet checked)',
} as const
const GOES: NasaSatelliteFields = {
  file: '/models/craft/goes.glb',
  sourceUrl: `${RES}/geostationary-operational-environmental-satellites/`,
  credit: 'NASA/Christopher R. Meaney',
  ...PLACEHOLDER_EARTH,
}
const LANDSAT_8: NasaSatelliteFields = {
  file: '/models/craft/landsat8.glb',
  sourceUrl: `${RES}/landsat-8/`,
  credit: 'NASA/Christopher R. Meaney',
  ...PLACEHOLDER_EARTH,
}
const SUOMI_NPP: NasaSatelliteFields = {
  file: '/models/craft/suomi-npp.glb',
  sourceUrl: `${RES}/suomi-national-polar-orbiting-partnership-suomi-npp/`,
  credit: 'NASA/Brian E. Kumanchik; NASA/Christian A. Lopez',
  ...PLACEHOLDER_EARTH,
}

// Third batch (#194). The same placeholder rule as above: no axis here was checked against
// the mesh. SDO and SORCE point at the Sun; the observatories and the spinning magnetosphere
// missions point at neither Earth nor the Sun, and have no attitude model yet.
const PLACEHOLDER_SUN = {
  attitude: 'sun',
  axis: [0, 0, 1],
  attitudeNote: 'Sun-pointing (model axis not yet checked)',
} as const
const PLACEHOLDER_NONE = {
  attitude: 'earth',
  axis: [0, -1, 0],
  attitudeNote: 'Attitude not modelled yet (model axis not yet checked)',
} as const
const NASA_REPO_TREE =
  'https://github.com/nasa/NASA-3D-Resources/tree/11ebb4ee043715aefbba6aeec8a61746fad67fa7/3D%20Models'

/** A third-batch model: file name, page, credit and attitude placeholder. */
function batch3(
  name: string,
  sourceUrl: string,
  credit: string,
  attitude: typeof PLACEHOLDER_EARTH | typeof PLACEHOLDER_SUN | typeof PLACEHOLDER_NONE,
): NasaSatelliteFields {
  return { file: `/models/craft/${name}.glb`, sourceUrl, credit, ...attitude }
}

const MEANEY = 'NASA/Christopher R. Meaney'
const MMS = batch3(
  'mms',
  `${RES}/magnetospheric-multiscale-mms-a/`,
  'NASA/Walter K. Feimer',
  PLACEHOLDER_NONE,
)
const THEMIS = batch3(
  'themis',
  `${RES}/time-history-of-events-and-macroscale-interactions-during-substorms-themis/`,
  'NASA/JPL/Eyes on the Solar System',
  PLACEHOLDER_NONE,
)
// The NASA page has the model but no Source field, so the credit is NASA's.
const CYGNSS = batch3(
  'cygnss',
  `${RES}/cyclone-global-navigation-satellite-system-cygnss/`,
  'NASA',
  PLACEHOLDER_EARTH,
)
// GRACE (B): the predecessor mission, the same wedge-shaped design as GRACE-FO.
const GRACE = batch3(
  'grace',
  `${RES}/gravity-recovery-and-climate-experiment-grace-b/`,
  'NASA/Christopher M. Garcia',
  PLACEHOLDER_EARTH,
)
const SENTINEL_6 = batch3(
  'sentinel6',
  `${RES}/jason-continuity-of-service-sentinel-6/`,
  'NASA/Matthew J. Garcia',
  PLACEHOLDER_EARTH,
)

const BATCH3_MODELS: SatelliteModelTable = {
  '40059': nasaSatellite(
    batch3('oco2', `${RES}/orbiting-carbon-observatory-oco-2/`, MEANEY, PLACEHOLDER_EARTH),
  ),
  // SORCE and SDO have no page on science.nasa.gov: credit NASA, source the repository folder.
  '27651': nasaSatellite(
    batch3(
      'sorce',
      `${NASA_REPO_TREE}/Solar%20Radiation%20and%20Climate%20Experiment%20(SORCE)`,
      'NASA',
      PLACEHOLDER_SUN,
    ),
  ),
  '36395': nasaSatellite(
    batch3('sdo', `${NASA_REPO_TREE}/Solar%20Dynamics%20Observatory`, 'NASA', PLACEHOLDER_SUN),
  ),
  '25560': nasaSatellite(
    batch3('swas', `${RES}/submillimeter-wave-astronomy-satellite-swas/`, MEANEY, PLACEHOLDER_NONE),
  ),
  '25867': nasaSatellite(
    batch3(
      'chandra',
      `${RES}/chandra-x-ray-observatory/`,
      'NASA/Brian E. Kumanchik',
      PLACEHOLDER_NONE,
    ),
  ), // CXO
  '39574': nasaSatellite(
    batch3('gpm', `${RES}/global-precipitation-measurement/`, MEANEY, PLACEHOLDER_EARTH),
  ), // GPM-CORE
  ...sharing(['40482', '40483', '40484', '40485'], nasaSatellite(MMS, 'family')), // MMS 1 to 4
  ...sharing(['30580', '30797', '30798'], nasaSatellite(THEMIS, 'family')), // THEMIS A, D, E
  // CYGFM01 to 08 (FM06 is not in the active group).
  ...sharing(
    ['41887', '41886', '41891', '41885', '41884', '41890', '41888'],
    nasaSatellite(CYGNSS, 'family'),
  ),
  ...sharing(['43476', '43477'], nasaSatellite(GRACE, 'family')), // GRACE-FO 1, 2
  // JASON-3 is a near copy of Jason-2 (OSTM), the model shown for it.
  '41240': nasaSatellite(
    batch3(
      'jason2',
      `${RES}/ocean-surface-topography-mission-ostm-jason-2/`,
      'NASA/Kevin K. Lane',
      PLACEHOLDER_EARTH,
    ),
    'family',
  ),
  '46984': nasaSatellite(SENTINEL_6), // SENTINEL-6A
  '66514': nasaSatellite(SENTINEL_6, 'family'), // SENTINEL-6B, its twin
}

/**
 * By NORAD id, as a string: a model of that very object (`scope: 'own'`). The ISS is six
 * CelesTrak records (the station and five module records that carry its element set); they
 * share one model. Docked visiting vehicles (Soyuz, Progress, Dragon) are separate
 * spacecraft and have none.
 */
export const SATELLITE_MODELS_BY_NORAD: SatelliteModelTable = {
  // ISS (ZARYA), UNITY, ZVEZDA, DESTINY, POISK, NAUKA
  '25544': ISS_MODEL,
  '25575': ISS_MODEL,
  '26400': ISS_MODEL,
  '26700': ISS_MODEL,
  '36086': ISS_MODEL,
  '49044': ISS_MODEL,
  // HST
  '20580': nasaSatellite({
    file: '/models/craft/hubble.glb',
    sourceUrl: `${RES}/hubble-space-telescope-a/`,
    credit: 'NASA 3D Resources, model by DigitalSpace Corporation',
    attitude: 'sun',
    axis: HUBBLE_AXIS,
    attitudeNote:
      'Barrel square to the Sun, aperture never toward it (arrays drawn in one position)',
  }),
  // TERRA
  '25994': nasaSatellite({
    file: '/models/craft/terra.glb',
    sourceUrl: `${RES}/terra/`,
    credit: 'NASA/Christian A. Lopez',
    attitude: 'earth',
    axis: TERRA_AXIS,
    attitudeNote: 'Instrument side toward Earth, antenna away',
  }),
  ...sharing(['19548', '21639', '22314', '23613'], nasaSatellite(TDRS_GEN1, 'family')), // TDRS 3, 5, 6, 7
  ...sharing(['26388', '39070', '39504', '42915'], nasaSatellite(TDRS_GEN2, 'family')), // TDRS 8, 11, 12, 13
  // GOES 14 to 19. The model's shape (one array wing, a long magnetometer boom) is the GOES-R
  // series (16 to 19), but which satellite it shows is not stated, so all six are `family`.
  ...sharing(['35491', '36411', '41866', '43226', '51850', '60133'], nasaSatellite(GOES, 'family')),
  '39084': nasaSatellite(LANDSAT_8), // LANDSAT 8
  '49260': nasaSatellite(LANDSAT_8, 'family'), // LANDSAT 9, a near twin
  '27424': nasaSatellite({
    file: '/models/craft/aqua.glb',
    sourceUrl: `${RES}/aqua-b/`,
    credit: 'NASA/Brian E. Kumanchik; NASA/Christian A. Lopez',
    ...PLACEHOLDER_EARTH,
  }),
  '28376': nasaSatellite({
    file: '/models/craft/aura.glb',
    sourceUrl: `${RES}/aura-a/`,
    credit: 'NASA/Ames Research Center',
    ...PLACEHOLDER_EARTH,
  }),
  '37849': nasaSatellite(SUOMI_NPP), // SUOMI NPP
  // NOAA 20 and 21 (JPSS-1, JPSS-2) fly the same instruments on a bus of the same family.
  ...sharing(['43013', '54234'], nasaSatellite(SUOMI_NPP, 'family')),
  ...BATCH3_MODELS,
}

/**
 * By family id (a lower-case slug such as `starlink`): a stand-in shared by the family
 * (`scope: 'family'`). Empty until the family models land (#194).
 */
export const SATELLITE_MODELS_BY_FAMILY: SatelliteModelTable = {}

interface SatelliteTables {
  readonly byNorad: SatelliteModelTable
  readonly byFamily: SatelliteModelTable
}

/** A satellite's model: its own by NORAD id, else its family's, else undefined. */
export function modelForSatellite(
  noradId: number | string,
  family: string | null,
  tables: SatelliteTables = {
    byNorad: SATELLITE_MODELS_BY_NORAD,
    byFamily: SATELLITE_MODELS_BY_FAMILY,
  },
): ModelDescriptor | undefined {
  const own = tables.byNorad[String(noradId)]
  if (own) return own
  return family === null ? undefined : tables.byFamily[family]
}

const NAIF_KEY_PREFIX = 'naif:'
const SAT_KEY_PREFIX = 'sat:'

/**
 * The model for an orrery scene key (#203), or undefined: `naif:<id>` is a spacecraft
 * (a moon's key has the same shape and is not in the table), `sat:<norad>` a satellite
 * the renderer has loaded. `satellite` reads what the renderer knows of a satellite key;
 * it has no family field yet, so only an object's own entry can match until it does.
 */
export function modelForKey(
  key: string,
  satellite: (key: string) => { readonly noradId: string } | null,
  tables?: SatelliteTables,
): ModelDescriptor | undefined {
  if (key.startsWith(NAIF_KEY_PREFIX))
    return spacecraftDescriptor(key.slice(NAIF_KEY_PREFIX.length))
  if (!key.startsWith(SAT_KEY_PREFIX)) return undefined
  const info = satellite(key)
  return info ? modelForSatellite(info.noradId, null, tables) : undefined
}
