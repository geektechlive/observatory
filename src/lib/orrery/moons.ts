/**
 * The major moons the refresh job asks JPL Horizons for (#107), each centred on its own
 * planet. Every id was checked against a live Horizons answer on 2026-11-07: the target
 * and centre names below are Horizons' own ("Target body name: Io (501)", "Center body
 * name: Jupiter (599)"). Period and semi-major axis are copied from the physical-data
 * header of the same answers; Horizons marks the Galilean values approximate (~).
 *
 * Charon is left out: the orrery draws no Pluto for it to circle.
 *
 * Plain TypeScript with no imports, so scripts/orrery-bodies.mjs can import it directly
 * under Node's type stripping, like craft.ts.
 */
export interface MoonParent {
  readonly naifId: string
  /** As the orrery names the planet (src/lib/orrery/elements.ts). */
  readonly name: string
}

export interface MoonSpec {
  readonly naifId: string
  readonly name: string
  readonly parent: MoonParent
  readonly periodDays: number
  readonly semiMajorAxisKm: number
  readonly source: string
}

const JUPITER: MoonParent = { naifId: '599', name: 'Jupiter' }
const SATURN: MoonParent = { naifId: '699', name: 'Saturn' }
const URANUS: MoonParent = { naifId: '799', name: 'Uranus' }
const NEPTUNE: MoonParent = { naifId: '899', name: 'Neptune' }

const HORIZONS = 'JPL Horizons physical data (read 2026-11-07)'

export const MOONS: readonly MoonSpec[] = [
  {
    naifId: '501',
    name: 'Io',
    parent: JUPITER,
    periodDays: 1.77,
    semiMajorAxisKm: 422_000,
    source: HORIZONS,
  },
  {
    naifId: '502',
    name: 'Europa',
    parent: JUPITER,
    periodDays: 3.55,
    semiMajorAxisKm: 671_000,
    source: HORIZONS,
  },
  {
    naifId: '503',
    name: 'Ganymede',
    parent: JUPITER,
    periodDays: 7.155,
    semiMajorAxisKm: 1_070_000,
    source: HORIZONS,
  },
  {
    naifId: '504',
    name: 'Callisto',
    parent: JUPITER,
    periodDays: 16.691,
    semiMajorAxisKm: 1_883_000,
    source: HORIZONS,
  },
  {
    naifId: '602',
    name: 'Enceladus',
    parent: SATURN,
    periodDays: 1.370218,
    semiMajorAxisKm: 238_040,
    source: HORIZONS,
  },
  {
    naifId: '605',
    name: 'Rhea',
    parent: SATURN,
    periodDays: 4.518,
    semiMajorAxisKm: 527_070,
    source: HORIZONS,
  },
  {
    naifId: '606',
    name: 'Titan',
    parent: SATURN,
    periodDays: 15.945421,
    semiMajorAxisKm: 1_221_870,
    source: HORIZONS,
  },
  {
    naifId: '608',
    name: 'Iapetus',
    parent: SATURN,
    periodDays: 79.33,
    semiMajorAxisKm: 3_560_840,
    source: HORIZONS,
  },
  {
    naifId: '705',
    name: 'Miranda',
    parent: URANUS,
    periodDays: 1.413,
    semiMajorAxisKm: 129_800,
    source: HORIZONS,
  },
  {
    naifId: '703',
    name: 'Titania',
    parent: URANUS,
    periodDays: 8.706,
    semiMajorAxisKm: 435_800,
    source: HORIZONS,
  },
  {
    naifId: '704',
    name: 'Oberon',
    parent: URANUS,
    periodDays: 13.463,
    semiMajorAxisKm: 582_600,
    source: HORIZONS,
  },
  {
    naifId: '801',
    name: 'Triton',
    parent: NEPTUNE,
    periodDays: 5.876994,
    semiMajorAxisKm: 354_800,
    source: HORIZONS,
  },
]

/** The moons' sampled span, days either side of now. Shorter than the craft's 30: the
 *  fast moons are sampled every few hours, and the payload stays small. */
export const MOON_WINDOW_DAYS = 15

/**
 * Samples per orbit, at least. Cubic Hermite on a circle sampled 14 times an orbit errs
 * by about 1e-4 of the radius (r·(ωh)^4/384): Io between its 3 h samples is within
 * 100 km of Horizons (tests/unit/orrery-moons.test.ts).
 */
export const MOON_SAMPLES_PER_ORBIT = 14

/** Steps Horizons takes as whole hours or days, coarsest first. */
export const MOON_STEPS_DAYS: readonly number[] = [1, 1 / 2, 1 / 4, 1 / 8, 1 / 12]

/** The coarsest step that still samples the orbit MOON_SAMPLES_PER_ORBIT times. */
export function moonStepDays(periodDays: number): number {
  const wanted = periodDays / MOON_SAMPLES_PER_ORBIT
  for (const step of MOON_STEPS_DAYS) if (step <= wanted) return step
  return MOON_STEPS_DAYS[MOON_STEPS_DAYS.length - 1] ?? 1 / 12
}
