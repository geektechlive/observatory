import type { PagesFunction } from '@cloudflare/workers-types'
import { z } from 'zod'

import {
  type Cme,
  CmeSchema,
  type DonkiResponse,
  GeomagneticStormSchema,
  SepSchema,
  type SolarFlare,
} from '../../src/schemas/donki'
import { cachedJson, fetchUpstream, upstreamError } from './_cache'

/**
 * CME, storms and SEPs come from DONKI through api.nasa.gov. CCMC moved DONKI on 2026-09-30:
 * api.nasa.gov still answers those three but 404s FLR, and CCMC's own host times out from
 * Workers (#65, ADR 0034). Never call ccmc.gsfc.nasa.gov from here.
 */
const NASA_API_BASE = 'https://api.nasa.gov'
/** NOAA SWPC's 7-day GOES flare list (~43 KB): the flare source, not a fallback (ADR 0034). */
const NOAA_FLARES = 'https://services.swpc.noaa.gov/json/goes/primary/xray-flares-7-day.json'
const CACHE_TTL_SECONDS = 900 // 15 min
/**
 * A healthy DONKI answers in well under a second. While it hangs (#42), the 8 s default
 * deadline made every cache miss wait 8 s before the NOAA fallback (#82).
 */
const DONKI_TIMEOUT_MS = 3000
/**
 * One stable key, not one per date (#61): at midnight a dated key left stale-if-error
 * with nothing to fall back to.
 */
const CACHE_KEY = 'nasa:donki:latest:v3' // v3: flares from NOAA, CME speed and type present (#65)

interface Env {
  NASA_API_KEY: string
}

interface FeedResult<T> {
  data: T[]
  /** false when the feed was unavailable, or every row it sent failed our schema (drift) */
  ok: boolean
  /** Why a feed is not ok: unavailable (upstream) or the wrong shape (contract). */
  why?: 'upstream' | 'contract'
  quota: string | null
}

const NoaaFlareSchema = z.object({
  begin_time: z.string(),
  max_time: z.string().nullable().optional(),
  end_time: z.string().nullable().optional(),
  max_class: z.string().nullable().optional(),
})

/**
 * CCMC keeps a CME's speed and type inside `cmeAnalyses[]`, not on the row. Lift them from
 * the most accurate analysis (else the last) so the client payload keeps its flat shape.
 */
const RawCmeSchema = CmeSchema.extend({
  cmeAnalyses: z
    .array(
      z.object({
        isMostAccurate: z.boolean().nullable().optional(),
        speed: z.number().nullable().optional(),
        type: z.string().nullable().optional(),
      }),
    )
    .nullable()
    .optional(),
}).transform(({ cmeAnalyses, ...cme }): Cme => {
  // One analysis is chosen and its fields used, even if null: we don't mix analyses. "Last" is
  // array order, not a documented newest-first rule.
  const analysis = cmeAnalyses?.find((a) => a.isMostAccurate === true) ?? cmeAnalyses?.at(-1)
  return { ...cme, type: analysis?.type ?? cme.type, speed: analysis?.speed ?? cme.speed }
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

async function fetchFeed<T>(
  url: string,
  schema: z.ZodType<T>,
  timeoutMs?: number,
): Promise<FeedResult<T>> {
  try {
    const res = await fetchUpstream(url, undefined, timeoutMs ? { timeoutMs } : undefined)
    const quota = res.headers.get('X-RateLimit-Remaining')
    if (!res.ok) return { data: [], ok: false, why: 'upstream', quota }
    const rows = await readArray(res)
    if (rows === null) return { data: [], ok: false, why: 'contract', quota }
    const { data, drift } = parseRows(rows, schema)
    return drift ? { data, ok: false, why: 'contract', quota } : { data, ok: true, quota }
  } catch {
    // A timeout on one feed must not sink the others.
    return { data: [], ok: false, why: 'upstream', quota: null }
  }
}

/** NOAA's flare rows in DONKI's flare shape, newest first. */
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
  return { ...feed, data: flares }
}

export const onRequest: PagesFunction<Env> = (ctx) => {
  return cachedJson(ctx, CACHE_KEY, CACHE_TTL_SECONDS, async () => {
    if (!ctx.env.NASA_API_KEY)
      console.warn('[donki] NASA_API_KEY missing — falling back to DEMO_KEY (rate-limited)')
    const apiKey = ctx.env.NASA_API_KEY || 'DEMO_KEY'
    const range = `startDate=${dateString(-7)}&endDate=${dateString(0)}&api_key=${apiKey}`
    const donki = (endpoint: string) => `${NASA_API_BASE}/DONKI/${endpoint}?${range}`

    // DONKI has been down for days at a time (#42); fetchFeed never rejects.
    const [flaresResult, cmesResult, stormsResult, sepsResult] = await Promise.all([
      noaaFlares(),
      fetchFeed(donki('CME'), RawCmeSchema, DONKI_TIMEOUT_MS),
      fetchFeed(donki('GST'), GeomagneticStormSchema, DONKI_TIMEOUT_MS),
      fetchFeed(donki('SEP'), SepSchema, DONKI_TIMEOUT_MS),
    ])

    const feeds = [flaresResult, cmesResult, stormsResult, sepsResult]
    if (feeds.every((f) => !f.ok)) return upstreamError(0, 'DONKI and NOAA flares unavailable')
    const failed = feeds.filter((f) => !f.ok)
    if (failed.length > 0)
      console.warn(`[donki] ${String(failed.length)} of 4 feeds failed; answering degraded`)

    const data: DonkiResponse = {
      flares: flaresResult.data,
      cmes: cmesResult.data,
      geomagneticStorms: stormsResult.data,
      seps: sepsResult.data,
    }

    // Note: accurate only on a cache MISS — a HIT serves the header value that
    // was current at write time, not NASA's live remaining count.
    const extraHeaders: Record<string, string> = {}
    const quota = cmesResult.quota ?? stormsResult.quota ?? sepsResult.quota
    if (quota !== null) extraHeaders['X-Quota-Remaining'] = quota

    // A degraded answer says why and who failed (#71): the health check holds an
    // upstream outage for 4 runs, but drift must alert on the first. NOAA flares alone
    // are the normal answer and say nothing.
    if (failed.length > 0) {
      extraHeaders['X-Error-Kind'] = failed.some((f) => f.why === 'contract')
        ? 'contract'
        : 'upstream'
      // Here X-Data-Source names the source(s) that FAILED, so an incident reads "degraded (noaa)".
      const failedSources = [
        [cmesResult, stormsResult, sepsResult].some((f) => !f.ok) ? 'donki' : null,
        flaresResult.ok ? null : 'noaa',
      ].filter((s) => s !== null)
      extraHeaders['X-Data-Source'] = failedSources.join(',')
    }

    return { body: JSON.stringify(data), extraHeaders, degraded: failed.length > 0 }
  })
}
