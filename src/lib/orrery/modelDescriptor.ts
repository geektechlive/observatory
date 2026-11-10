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

/**
 * By NORAD id, as a string: a model of that very object (`scope: 'own'`). Empty until the
 * tier-A models land (#194).
 */
export const SATELLITE_MODELS_BY_NORAD: SatelliteModelTable = {}

/**
 * By family id (a lower-case slug such as `starlink`): a stand-in shared by the family
 * (`scope: 'family'`). Empty until the tier-A models land (#194).
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
