import type { PagesFunction } from '@cloudflare/workers-types'
import { z } from 'zod'

import {
  CmeSchema,
  type DonkiResponse,
  GeomagneticStormSchema,
  SepSchema,
  type SolarFlare,
  SolarFlareSchema,
} from '../../src/schemas/donki'
import { cachedJson, fetchUpstream, upstreamError } from './_cache'

const NASA_API_BASE = 'https://api.nasa.gov'
/** NOAA SWPC's 7-day GOES flare list (~23 KB): the flare fallback while DONKI is down. */
const NOAA_FLARES = 'https://services.swpc.noaa.gov/json/goes/primary/xray-flares-7-day.json'
const CACHE_TTL_SECONDS = 900 // 15 min
/**
 * One stable key, not one per date (#61): at midnight a dated key left stale-if-error
 * with nothing to fall back to.
 */
const CACHE_KEY = 'nasa:donki:latest:v1'

interface Env {
  NASA_API_KEY: string
}

interface FeedResult<T> {
  data: T[]
  /** false when the feed was unavailable, or every row it sent failed our schema (drift) */
  ok: boolean
  quota: string | null
}

const NoaaFlareSchema = z.object({
  begin_time: z.string(),
  max_time: z.string().nullable().optional(),
  end_time: z.string().nullable().optional(),
  max_class: z.string().nullable().optional(),
})

function dateString(offsetDays: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

/** Parse a JSON array feed; DONKI sends an empty body when a week has no events. */
async function readArray(res: Response): Promise<unknown[] | null> {
  const text = await res.text()
  if (text.trim() === '') return []
  try {
    const raw: unknown = JSON.parse(text)
    return Array.isArray(raw) ? raw : null
  } catch {
    return null
  }
}

/** Keeps the rows that pass the schema. Rows that all fail mean drift, not a quiet week. */
function parseRows<T>(rows: unknown[], schema: z.ZodType<T>): { data: T[]; drift: boolean } {
  const data = rows
    .map((item) => schema.safeParse(item))
    .filter((r): r is z.ZodSafeParseSuccess<T> => r.success)
    .map((r) => r.data)
  return { data, drift: rows.length > 0 && data.length === 0 }
}

async function fetchFeed<T>(url: string, schema: z.ZodType<T>): Promise<FeedResult<T>> {
  try {
    const res = await fetchUpstream(url)
    const quota = res.headers.get('X-RateLimit-Remaining')
    if (!res.ok) return { data: [], ok: false, quota }
    const rows = await readArray(res)
    if (rows === null) return { data: [], ok: false, quota }
    const { data, drift } = parseRows(rows, schema)
    return { data, ok: !drift, quota }
  } catch {
    // A timeout on one feed must not sink the other three.
    return { data: [], ok: false, quota: null }
  }
}

/** NOAA's flare rows in DONKI's shape, newest first like DONKI. */
async function noaaFlares(): Promise<FeedResult<SolarFlare>> {
  const feed = await fetchFeed(NOAA_FLARES, NoaaFlareSchema)
  const flares = feed.data
    .map((f) => ({
      flrID: `NOAA-${f.begin_time}`,
      beginTime: f.begin_time,
      peakTime: f.max_time ?? null,
      endTime: f.end_time ?? null,
      classType: f.max_class ?? null,
    }))
    .reverse()
  return { data: flares, ok: feed.ok, quota: null }
}

export const onRequest: PagesFunction<Env> = (ctx) => {
  return cachedJson(ctx, CACHE_KEY, CACHE_TTL_SECONDS, async () => {
    if (!ctx.env.NASA_API_KEY)
      console.warn('[donki] NASA_API_KEY missing — falling back to DEMO_KEY (rate-limited)')
    const apiKey = ctx.env.NASA_API_KEY || 'DEMO_KEY'
    const range = `startDate=${dateString(-7)}&endDate=${dateString(0)}&api_key=${apiKey}`
    const donki = (endpoint: string) => `${NASA_API_BASE}/DONKI/${endpoint}?${range}`

    const [flaresResult, cmesResult, stormsResult, sepsResult] = await Promise.all([
      fetchFeed(donki('FLR'), SolarFlareSchema),
      fetchFeed(donki('CME'), CmeSchema),
      fetchFeed(donki('GST'), GeomagneticStormSchema),
      fetchFeed(donki('SEP'), SepSchema),
    ])
    // DONKI has been 503 for days at a time (#42). Flares can come from NOAA instead.
    const flares = flaresResult.ok ? flaresResult : await noaaFlares()

    const feeds = [flares, cmesResult, stormsResult, sepsResult]
    if (feeds.every((f) => !f.ok)) return upstreamError(0, 'DONKI and NOAA flares unavailable')
    const failed = [flaresResult, cmesResult, stormsResult, sepsResult].filter((f) => !f.ok)
    if (failed.length > 0)
      console.warn(`[donki] ${String(failed.length)} of 4 DONKI feeds failed; answering degraded`)

    const data: DonkiResponse = {
      flares: flares.data,
      cmes: cmesResult.data,
      geomagneticStorms: stormsResult.data,
      seps: sepsResult.data,
    }

    // Note: accurate only on a cache MISS — a HIT serves the header value that
    // was current at write time, not NASA's live remaining count.
    const extraHeaders: Record<string, string> = {}
    const quota = flaresResult.quota ?? cmesResult.quota ?? stormsResult.quota ?? sepsResult.quota
    if (quota !== null) extraHeaders['X-Quota-Remaining'] = quota

    return { body: JSON.stringify(data), extraHeaders, degraded: failed.length > 0 }
  })
}
