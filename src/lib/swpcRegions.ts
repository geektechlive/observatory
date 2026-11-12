// Pure parsers for NOAA SWPC's solar_probabilities.json and solar_regions.json (#210).
// Shared by functions/api/solar-regions.ts and the tests, so it holds no Worker types.
import { z } from 'zod'

const DAY_MS = 86_400_000

const ProbabilityRowSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
    c_class_1_day: z.number(),
    m_class_1_day: z.number(),
    x_class_1_day: z.number(),
    '10mev_protons_1_day': z.number(),
  })
  .loose()

const RegionRowSchema = z
  .object({
    observed_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    region: z.number(),
    latitude: z.number(),
    longitude: z.number(),
    location: z.string(),
    area: z.number().nullable(),
    spot_class: z.string().nullable(),
    mag_class: z.string().nullable(),
    number_spots: z.number().nullable(),
    c_flare_probability: z.number().nullable(),
    m_flare_probability: z.number().nullable(),
    x_flare_probability: z.number().nullable(),
    proton_probability: z.number().nullable(),
  })
  .loose()

export interface FlareOdds {
  /** The UTC day SWPC issued the forecast. */
  issued: string
  /** The UTC day the odds are for: day 1 of that forecast. */
  forDate: string
  c: number
  m: number
  x: number
  proton: number
}

export interface ActiveRegion {
  region: number
  location: string
  latitude: number
  /** Degrees from the central meridian, east positive, as SWPC gives it. */
  longitude: number
  area: number | null
  /** Null until SWPC compiles the day's region summary (#213). */
  spotClass: string | null
  magClass: string | null
  spots: number | null
  c: number | null
  m: number | null
  x: number | null
  proton: number | null
}

export interface ActiveRegions {
  observedDate: string
  /**
   * SWPC's "Locations Valid at" time: the end of the observed day, UTC. On an early day
   * this is still ahead: SWPC carries each report's positions forward to it (#213).
   */
  validAt: string
  /** Early reports only: classes and region odds not yet issued (#213). */
  preliminary: boolean
  items: ActiveRegion[]
}

function nextDay(ymd: string): string {
  return new Date(Date.parse(`${ymd}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10)
}

/** The newest forecast's day-1 odds, or null when the payload isn't SWPC's shape. */
export function parseProbabilities(json: unknown): FlareOdds | null {
  if (!Array.isArray(json) || json.length === 0) return null
  let newest: unknown = null
  let newestDate = ''
  for (const row of json as unknown[]) {
    const date = (row as { date?: unknown } | null)?.date
    if (typeof date === 'string' && date > newestDate) {
      newestDate = date
      newest = row
    }
  }
  const parsed = ProbabilityRowSchema.safeParse(newest)
  if (!parsed.success) return null
  const issued = parsed.data.date.slice(0, 10)
  return {
    issued,
    forDate: nextDay(issued),
    c: parsed.data.c_class_1_day,
    m: parsed.data.m_class_1_day,
    x: parsed.data.x_class_1_day,
    proton: parsed.data['10mev_protons_1_day'],
  }
}

type RegionRow = z.infer<typeof RegionRowSchema>

function hasSpots(r: RegionRow): boolean {
  return (r.number_spots ?? 0) > 0 || r.area !== null
}

function toRegion(r: RegionRow, preliminary: boolean): ActiveRegion {
  return {
    region: r.region,
    location: r.location,
    latitude: r.latitude,
    longitude: r.longitude,
    area: r.area,
    spotClass: r.spot_class,
    magClass: r.mag_class,
    spots: r.number_spots,
    // On an early day SWPC's odds are 0 for every region, placeholders until the summary.
    c: preliminary ? null : r.c_flare_probability,
    m: preliminary ? null : r.m_flare_probability,
    x: preliminary ? null : r.x_flare_probability,
    proton: preliminary ? null : r.proton_probability,
  }
}

/**
 * The newest day's regions with sunspots (the region summary's section I). A row with
 * neither spots nor area is a plage-only or departed region, with no spot to mark.
 * A spotted row without a spot class means the day is early (#213): SWPC has early
 * observatory reports but has not compiled the summary, so classes and odds are not issued.
 * Only the newest day's rows are validated, so the cost stays flat as the file grows.
 */
export function parseRegions(json: unknown): ActiveRegions | null {
  if (!Array.isArray(json) || json.length === 0) return null
  const rows = json as unknown[]
  let newestDate = ''
  for (const row of rows) {
    const date = (row as { observed_date?: unknown } | null)?.observed_date
    if (typeof date === 'string' && date > newestDate) newestDate = date
  }
  const newest = rows.filter(
    (row) => (row as { observed_date?: unknown } | null)?.observed_date === newestDate,
  )
  const parsed = z.array(RegionRowSchema).safeParse(newest)
  if (!parsed.success || parsed.data.length === 0) return null

  const spotted = parsed.data.filter(hasSpots)
  const preliminary = spotted.some((r) => r.spot_class === null)
  const items = spotted.map((r) => toRegion(r, preliminary)).sort((a, b) => a.region - b.region)
  // Early rows too: each observatory's position is carried to the end of the day (#213).
  return {
    observedDate: newestDate,
    validAt: `${nextDay(newestDate)}T00:00:00Z`,
    preliminary,
    items,
  }
}
