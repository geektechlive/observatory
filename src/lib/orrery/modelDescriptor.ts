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

/** A NASA 3D Resources model of the very satellite it is filed under. */
function nasaSatellite(fields: NasaSatelliteFields): FileDescriptor {
  return { ...fields, kind: 'file', licence: NASA_LICENCE, scope: 'own' }
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
