/**
 * The major moons the refresh job asks JPL Horizons for (#107), each centred on its own
 * planet. Every id was checked against a live Horizons answer on 2026-11-07: the target
 * and centre names below are Horizons' own ("Target body name: Io (501)", "Center body
 * name: Jupiter (599)"). Period and semi-major axis are copied from the physical-data
 * header of the same answers; Horizons marks the Galilean values approximate (~).
 *
 * Charon is not here: it travels with the dwarf planets (dwarfs.ts, /api/orrery-dwarfs),
 * placed around Pluto's px-clamped marker rather than a planet's drawn radius. It reuses
 * this window and step (moonWindowDays, moonStepDays).
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
  /** Mean radius, km (JPL Planetary Satellite Physical Parameters, read 2026-11-17; #261). */
  readonly radiusKm: number
  readonly source: string
}

const MARS: MoonParent = { naifId: '499', name: 'Mars' }
const JUPITER: MoonParent = { naifId: '599', name: 'Jupiter' }
const SATURN: MoonParent = { naifId: '699', name: 'Saturn' }
const URANUS: MoonParent = { naifId: '799', name: 'Uranus' }
const NEPTUNE: MoonParent = { naifId: '899', name: 'Neptune' }

const HORIZONS = 'JPL Horizons physical data (read 2026-11-07)'

export const MOONS: readonly MoonSpec[] = [
  // Mars's moons, checked live on 2026-11-07: "Phobos (401)" / "Deimos (402)" around
  // "Mars (499)" (Horizons mar099).
  {
    naifId: '401',
    name: 'Phobos',
    parent: MARS,
    periodDays: 0.319,
    semiMajorAxisKm: 9_377.2,
    radiusKm: 11.08,
    source: HORIZONS,
  },
  {
    naifId: '402',
    name: 'Deimos',
    parent: MARS,
    periodDays: 1.263,
    semiMajorAxisKm: 23_463.2,
    radiusKm: 6.2,
    source: HORIZONS,
  },
  {
    naifId: '501',
    name: 'Io',
    parent: JUPITER,
    periodDays: 1.77,
    semiMajorAxisKm: 422_000,
    radiusKm: 1_821.49,
    source: HORIZONS,
  },
  {
    naifId: '502',
    name: 'Europa',
    parent: JUPITER,
    periodDays: 3.55,
    semiMajorAxisKm: 671_000,
    radiusKm: 1_560.8,
    source: HORIZONS,
  },
  {
    naifId: '503',
    name: 'Ganymede',
    parent: JUPITER,
    periodDays: 7.155,
    semiMajorAxisKm: 1_070_000,
    radiusKm: 2_631.2,
    source: HORIZONS,
  },
  {
    naifId: '504',
    name: 'Callisto',
    parent: JUPITER,
    periodDays: 16.691,
    semiMajorAxisKm: 1_883_000,
    radiusKm: 2_410.3,
    source: HORIZONS,
  },
  {
    naifId: '602',
    name: 'Enceladus',
    parent: SATURN,
    periodDays: 1.370218,
    semiMajorAxisKm: 238_040,
    radiusKm: 252.1,
    source: HORIZONS,
  },
  {
    naifId: '605',
    name: 'Rhea',
    parent: SATURN,
    periodDays: 4.518,
    semiMajorAxisKm: 527_070,
    radiusKm: 763.5,
    source: HORIZONS,
  },
  {
    naifId: '606',
    name: 'Titan',
    parent: SATURN,
    periodDays: 15.945421,
    semiMajorAxisKm: 1_221_870,
    radiusKm: 2_574.76,
    source: HORIZONS,
  },
  {
    naifId: '608',
    name: 'Iapetus',
    parent: SATURN,
    periodDays: 79.33,
    semiMajorAxisKm: 3_560_840,
    radiusKm: 734.3,
    source: HORIZONS,
  },
  {
    naifId: '705',
    name: 'Miranda',
    parent: URANUS,
    periodDays: 1.413,
    semiMajorAxisKm: 129_800,
    radiusKm: 235.8,
    source: HORIZONS,
  },
  {
    naifId: '703',
    name: 'Titania',
    parent: URANUS,
    periodDays: 8.706,
    semiMajorAxisKm: 435_800,
    radiusKm: 788.9,
    source: HORIZONS,
  },
  {
    naifId: '704',
    name: 'Oberon',
    parent: URANUS,
    periodDays: 13.463,
    semiMajorAxisKm: 582_600,
    radiusKm: 761.4,
    source: HORIZONS,
  },
  {
    naifId: '801',
    name: 'Triton',
    parent: NEPTUNE,
    periodDays: 5.876994,
    semiMajorAxisKm: 354_800,
    radiusKm: 1_352.6,
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

/** Steps Horizons takes as whole days, hours or minutes, coarsest first. Phobos (7.7 h
 *  orbit) needs the 30 min step. */
export const MOON_STEPS_DAYS: readonly number[] = [1, 1 / 2, 1 / 4, 1 / 8, 1 / 12, 1 / 24, 1 / 48]

/** The coarsest step that still samples the orbit MOON_SAMPLES_PER_ORBIT times. */
export function moonStepDays(periodDays: number): number {
  const wanted = periodDays / MOON_SAMPLES_PER_ORBIT
  for (const step of MOON_STEPS_DAYS) if (step <= wanted) return step
  return MOON_STEPS_DAYS[MOON_STEPS_DAYS.length - 1] ?? 1 / 48
}

/**
 * Samples per moon, at most. Enceladus and Miranda at 2 h over ±15 days are 361; Phobos
 * at 30 min would be 1,441 (about 170 kB), so a fast moon's window shrinks instead.
 */
export const MOON_MAX_SAMPLES = 400

/** Days either side of now a moon is sampled: the full window, or fewer for a fast moon. */
export function moonWindowDays(periodDays: number): number {
  const step = moonStepDays(periodDays)
  const fits = Math.floor((MOON_MAX_SAMPLES * step) / 2)
  return Math.max(1, Math.min(MOON_WINDOW_DAYS, fits))
}
