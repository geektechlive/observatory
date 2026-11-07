/**
 * What each spacecraft looks like in the orrery (#115): a silhouette at a distance, and
 * up close NASA's own 3D model or, where none is published for reuse, a simplified model
 * built in code.
 *
 * NASA's terms cover 3D models ("generally are not subject to copyright", "NASA should be
 * acknowledged as the source", nasa.gov/nasa-brand-center/images-and-media); the credit
 * is the Source line of each model's page. Logos and insignia are never used. ESA's
 * Sci-Fleet models (BepiColombo, Solar Orbiter) wait on ESA's licence answer, asked
 * 2026-11-07, so those two are simplified models for now. Psyche and Lucy have no
 * published model.
 *
 * Each model's `axis` is the direction in its own frame that should point at the
 * attitude target, read from renders of each model along +X, +Y and +Z.
 */
export type Attitude = 'earth' | 'sun' | 'ecliptic-north'

export type SilhouetteKey =
  | 'voyager'
  | 'new-horizons'
  | 'parker'
  | 'juno'
  | 'clipper'
  | 'psyche'
  | 'lucy'
  | 'solar-orbiter'
  | 'bepicolombo'
  | 'jwst'
  | 'dscovr'
  | 'ace'
  | 'soho'
  | 'wind'

export type StandInKey = 'psyche' | 'lucy' | 'solar-orbiter' | 'bepicolombo'

interface Common {
  readonly silhouette: SilhouetteKey
  readonly attitude: Attitude
  /** The model-frame axis that points at the attitude target. */
  readonly axis: readonly [number, number, number]
  /** What the attitude means, for the inspector. */
  readonly attitudeNote: string
}

export interface NasaModel extends Common {
  readonly kind: 'nasa'
  readonly file: string
  readonly credit: string
  readonly sourceUrl: string
}

export interface StandInModel extends Common {
  readonly kind: 'simplified'
  readonly file: null
  readonly standIn: StandInKey
  readonly credit: 'Simplified model'
}

export type CraftModel = NasaModel | StandInModel

const RES = 'https://science.nasa.gov/3d-resources'

const VOYAGER: NasaModel = {
  kind: 'nasa',
  file: '/models/craft/voyager.glb',
  credit: 'NASA/Christopher R. Meaney',
  sourceUrl: `${RES}/voyager-probe-a/`,
  silhouette: 'voyager',
  attitude: 'earth',
  axis: [0, 1, 0],
  attitudeNote: 'High-gain antenna toward Earth',
}

const standIn = (key: StandInKey, note: string): StandInModel => ({
  kind: 'simplified',
  file: null,
  standIn: key,
  credit: 'Simplified model',
  silhouette: key,
  attitude: 'sun',
  axis: [0, 1, 0],
  attitudeNote: note,
})

/** By NAIF id. */
export const CRAFT_MODELS: Readonly<Record<string, CraftModel>> = {
  '-31': VOYAGER,
  // Voyager 2 is the same design as Voyager 1.
  '-32': VOYAGER,
  '-98': {
    kind: 'nasa',
    file: '/models/craft/new-horizons.glb',
    credit: 'NASA 3D Resources, 3D-printing parts (assembled here; arrangement approximate)',
    sourceUrl: `${RES}/new-horizons/`,
    silhouette: 'new-horizons',
    attitude: 'earth',
    axis: [0, 1, 0],
    attitudeNote: 'High-gain antenna toward Earth',
  },
  '-96': {
    kind: 'nasa',
    file: '/models/craft/parker.glb',
    credit: 'NASA/Matthew J. Garcia',
    sourceUrl: `${RES}/parker-solar-probe/`,
    silhouette: 'parker',
    attitude: 'sun',
    axis: [0, 0, -1],
    attitudeNote: 'Heat shield toward the Sun',
  },
  '-61': {
    kind: 'nasa',
    file: '/models/craft/juno.glb',
    credit: 'NASA Science (3D Resources catalog)',
    sourceUrl: `${RES}/juno-b/`,
    silhouette: 'juno',
    attitude: 'earth',
    axis: [0, 1, 0],
    attitudeNote: 'Spin axis and antenna toward Earth',
  },
  '-159': {
    kind: 'nasa',
    file: '/models/craft/clipper.glb',
    credit: 'NASA Visualization Technology Applications and Development (VTAD)',
    sourceUrl: 'https://science.nasa.gov/resource/europa-clipper-3d-model/',
    silhouette: 'clipper',
    attitude: 'sun',
    axis: [0, 0, 1],
    attitudeNote: 'Solar arrays toward the Sun (simplified for the web)',
  },
  '-255': standIn('psyche', 'Solar arrays toward the Sun'),
  '-49': standIn('lucy', 'Solar arrays toward the Sun'),
  '-144': standIn('solar-orbiter', 'Heat shield toward the Sun'),
  '-121': standIn('bepicolombo', 'Solar array toward the Sun'),
  '-170': {
    kind: 'nasa',
    file: '/models/craft/jwst.glb',
    credit: 'NASA and Christopher R. Meaney',
    sourceUrl: `${RES}/james-webb-space-telescope-b/`,
    silhouette: 'jwst',
    attitude: 'sun',
    axis: [0, -1, 0],
    attitudeNote: 'Sunshield toward the Sun',
  },
  '-78': {
    kind: 'nasa',
    file: '/models/craft/dscovr.glb',
    credit: 'NASA Science, 3D Resources catalog',
    sourceUrl: `${RES}/deep-space-climate-observatory-dscovr-triana/`,
    silhouette: 'dscovr',
    attitude: 'earth',
    axis: [0, 1, 0],
    attitudeNote: 'Toward Earth (default orientation)',
  },
  '-92': {
    kind: 'nasa',
    file: '/models/craft/ace.glb',
    credit: 'NASA and Christopher R. Meaney',
    sourceUrl: `${RES}/advanced-composition-explorer/`,
    silhouette: 'ace',
    attitude: 'sun',
    axis: [0, 1, 0],
    attitudeNote: 'Spin axis toward the Sun',
  },
  '-21': {
    kind: 'nasa',
    file: '/models/craft/soho.glb',
    credit: 'NASA 3D Resources',
    sourceUrl: 'https://github.com/nasa/NASA-3D-Resources',
    silhouette: 'soho',
    attitude: 'sun',
    axis: [0, 1, 0],
    attitudeNote: 'Solar panels toward the Sun (default orientation)',
  },
  '-8': {
    kind: 'nasa',
    file: '/models/craft/wind.glb',
    credit: 'NASA/Christopher R. Meaney',
    sourceUrl: `${RES}/wind/`,
    silhouette: 'wind',
    attitude: 'ecliptic-north',
    axis: [0, 1, 0],
    attitudeNote: 'Spin axis toward ecliptic north',
  },
}

export function craftModelFor(naifId: string): CraftModel | undefined {
  return CRAFT_MODELS[naifId]
}

interface V3 {
  x: number
  y: number
  z: number
}

/**
 * Unit direction, heliocentric ecliptic, a craft's `axis` should point along: the Sun,
 * Earth (both from the craft's sampled position), or ecliptic north.
 */
export function attitudeDirection(attitude: Attitude, craft: V3, earth: V3): V3 {
  if (attitude === 'ecliptic-north') return { x: 0, y: 0, z: 1 }
  const to = attitude === 'sun' ? { x: 0, y: 0, z: 0 } : earth
  const d = { x: to.x - craft.x, y: to.y - craft.y, z: to.z - craft.z }
  const n = Math.hypot(d.x, d.y, d.z) || 1
  return { x: d.x / n, y: d.y / n, z: d.z / n }
}
