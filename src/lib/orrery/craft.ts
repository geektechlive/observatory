/**
 * The bodies the refresh job asks JPL Horizons for (#93), and how the orrery groups them
 * (spec Part 19). The NAIF ids were each checked against Horizons on 2026-11-06, and DSN
 * reports the same numbers as `spacecraftID`.
 *
 * Plain TypeScript with no imports, so scripts/refresh-data.mjs can import it directly
 * under Node's type stripping. Launch dates only seed the whole-mission span: the job
 * clamps to wherever Horizons says the ephemeris actually starts and ends.
 */
export type CraftGroup = 'deep-space' | 'mission' | 'l1' | 'planet' | 'moon'
export type CraftCategory = 'spacecraft' | 'space_telescope' | 'planet' | 'moon'

export interface CraftSpec {
  readonly naifId: string
  readonly name: string
  readonly mission: string
  readonly category: CraftCategory
  readonly group: CraftGroup
  /** First day of the whole-mission span (YYYY-MM-DD); null: no coarse span. */
  readonly launch: string | null
  /** Fine-span step, days (Parker moves fast near perihelion). */
  readonly fineStepDays: number
  /**
   * Cap on the whole-mission step, days, for craft that loop the Sun quickly: at the
   * default ~25 days Parker's 88-day orbit drew as a jagged polygon (2026-11-06).
   */
  readonly maxCoarseStepDays?: number
}

export const CRAFT: readonly CraftSpec[] = [
  {
    naifId: '399',
    name: 'Earth',
    mission: 'Planet',
    category: 'planet',
    group: 'planet',
    launch: null,
    fineStepDays: 1,
  },
  {
    naifId: '301',
    name: 'Moon',
    mission: 'Earth’s moon',
    category: 'moon',
    group: 'moon',
    launch: null,
    fineStepDays: 1,
  },
  {
    naifId: '-31',
    name: 'Voyager 1',
    mission: 'Voyager (NASA/JPL)',
    category: 'spacecraft',
    group: 'deep-space',
    launch: '1977-09-06',
    fineStepDays: 1,
  },
  {
    naifId: '-32',
    name: 'Voyager 2',
    mission: 'Voyager (NASA/JPL)',
    category: 'spacecraft',
    group: 'deep-space',
    launch: '1977-08-21',
    fineStepDays: 1,
  },
  {
    naifId: '-98',
    name: 'New Horizons',
    mission: 'New Horizons (NASA/APL)',
    category: 'spacecraft',
    group: 'deep-space',
    launch: '2006-01-20',
    fineStepDays: 1,
  },
  {
    naifId: '-96',
    name: 'Parker Solar Probe',
    mission: 'Parker Solar Probe (NASA/APL)',
    category: 'spacecraft',
    group: 'mission',
    launch: '2018-08-13',
    fineStepDays: 0.5,
    maxCoarseStepDays: 3,
  },
  {
    naifId: '-61',
    name: 'Juno',
    mission: 'Juno (NASA/JPL)',
    category: 'spacecraft',
    group: 'mission',
    launch: '2011-08-06',
    fineStepDays: 1,
  },
  {
    naifId: '-159',
    name: 'Europa Clipper',
    mission: 'Europa Clipper (NASA/JPL)',
    category: 'spacecraft',
    group: 'mission',
    launch: '2024-10-15',
    fineStepDays: 1,
  },
  {
    naifId: '-255',
    name: 'Psyche',
    mission: 'Psyche (NASA/JPL)',
    category: 'spacecraft',
    group: 'mission',
    launch: '2023-10-14',
    fineStepDays: 1,
  },
  {
    naifId: '-49',
    name: 'Lucy',
    mission: 'Lucy (NASA/SwRI)',
    category: 'spacecraft',
    group: 'mission',
    launch: '2021-10-17',
    fineStepDays: 1,
  },
  {
    naifId: '-144',
    name: 'Solar Orbiter',
    mission: 'Solar Orbiter (ESA/NASA)',
    category: 'spacecraft',
    group: 'mission',
    launch: '2020-02-11',
    fineStepDays: 1,
    maxCoarseStepDays: 8,
  },
  {
    naifId: '-121',
    name: 'BepiColombo',
    mission: 'BepiColombo (ESA/JAXA)',
    category: 'spacecraft',
    group: 'mission',
    launch: '2018-10-21',
    fineStepDays: 1,
    maxCoarseStepDays: 6,
  },
  {
    naifId: '-170',
    name: 'JWST',
    mission: 'James Webb Space Telescope (NASA/ESA/CSA), at Sun–Earth L2',
    category: 'space_telescope',
    group: 'l1',
    launch: '2021-12-27',
    fineStepDays: 1,
  },
  {
    naifId: '-78',
    name: 'DSCOVR',
    mission: 'DSCOVR (NOAA/NASA), at Sun–Earth L1',
    category: 'spacecraft',
    group: 'l1',
    launch: '2015-02-12',
    fineStepDays: 1,
  },
  {
    naifId: '-92',
    name: 'ACE',
    mission: 'Advanced Composition Explorer (NASA), at L1',
    category: 'spacecraft',
    group: 'l1',
    launch: '1997-08-26',
    fineStepDays: 1,
  },
  {
    naifId: '-21',
    name: 'SOHO',
    mission: 'SOHO (ESA/NASA), at L1',
    category: 'space_telescope',
    group: 'l1',
    launch: '1995-12-03',
    fineStepDays: 1,
  },
  {
    naifId: '-8',
    name: 'Wind',
    mission: 'Wind (NASA), at L1',
    category: 'spacecraft',
    group: 'l1',
    launch: '1994-11-02',
    fineStepDays: 1,
  },
]

/** The spacecraft only: what the scene draws as cyan markers. */
export const SPACECRAFT: readonly CraftSpec[] = CRAFT.filter(
  (c) => c.category === 'spacecraft' || c.category === 'space_telescope',
)

/** Fine span around "now", days each side. */
export const FINE_WINDOW_DAYS = 30
/** The whole-mission span runs this far past now, years. */
export const COARSE_FUTURE_YEARS = 5
/** Aim for about this many coarse samples per craft (positions only). */
export const COARSE_TARGET_SAMPLES = 200
/** Never sample the coarse span finer than this, days. */
export const COARSE_MIN_STEP_DAYS = 10

/**
 * The coarse step for a span: whole days, at least COARSE_MIN_STEP_DAYS, unless the
 * craft caps it (fast loopers, see maxCoarseStepDays).
 */
export function coarseStepDays(spanDays: number, maxStepDays?: number): number {
  const step = Math.max(COARSE_MIN_STEP_DAYS, Math.ceil(spanDays / COARSE_TARGET_SAMPLES))
  return maxStepDays === undefined ? step : Math.min(maxStepDays, step)
}
