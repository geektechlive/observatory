// Shared SWPC (Space Weather Prediction Center) upstream fetchers.
//
// NOAA changed both feeds this cycle:
//  - noaa-planetary-k-index.json is now an array of objects
//    ({ time_tag, Kp, a_running, station_count }), not string[][].
//  - solar-wind/{plasma,mag}-7-day.json are 404. The replacement is the
//    combined geospace/propagated-solar-wind-1-hour.json feed: array-of-arrays
//    with a header row (["time_tag","speed","density","temperature","bx","by",
//    "bz","bt","vx","vy","vz","propagated_time_tag"]) followed by ~60 one-minute
//    rows whose cells are NUMBERS (not numeric strings like the old feeds).
//
// Both solar-wind.ts and geomag.ts need this same 1-hour feed (solar-wind wants
// speed/density, geomag wants bz), so the raw upstream response is cached once
// per colo under its own key and each caller re-derives what it needs from the
// same parsed rows — one upstream fetch instead of two.
import { z } from 'zod'

import { cachedJson, fetchUpstream, upstreamError } from './_cache'

const KP_FEED = 'https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json'
const PSW_FEED =
  'https://services.swpc.noaa.gov/products/geospace/propagated-solar-wind-1-hour.json'
const SWPC_CACHE_TTL_SECONDS = 300
const UPSTREAM_TIMEOUT_MS = 8000

// Minimal structural shape of the Pages EventContext — _cache.ts's CacheCtx isn't
// exported, so this is duplicated here rather than importing a private type.
interface SwpcCacheCtx {
  request: { url: string }
  waitUntil(promise: Promise<unknown>): void
}

export interface KpReading {
  time: string
  kp: number
}

export interface PswReading {
  time: string
  speed: number | null
  density: number | null
  bz: number | null
}

const KpRawSchema = z.array(z.object({ time_tag: z.string(), Kp: z.number() }))
const PswRawSchema = z.array(z.array(z.union([z.number(), z.string(), z.null()])))

/** Coerce a NOAA cell to a number: accepts a number, a numeric string, or null. */
function toNum(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === 'number') return isFinite(v) ? v : null
  const n = parseFloat(v)
  return isFinite(n) ? n : null
}

/** Pure parser for noaa-planetary-k-index.json's array-of-objects shape. */
export function parseKp(json: unknown): KpReading[] {
  const parsed = KpRawSchema.safeParse(json)
  if (!parsed.success) return []
  return parsed.data.map((r) => ({ time: r.time_tag, kp: r.Kp }))
}

/**
 * Pure parser for propagated-solar-wind-1-hour.json's header + numeric-row
 * shape. Columns are looked up by name in the header row (row 0) rather than
 * by fixed index, since NOAA has reordered these columns before.
 */
export function parsePsw(json: unknown): PswReading[] {
  const parsed = PswRawSchema.safeParse(json)
  if (!parsed.success || parsed.data.length < 2) return []
  const header = parsed.data[0]
  if (!header) return []

  const colIndex = (name: string): number => header.findIndex((c) => c === name)
  const timeIdx = colIndex('time_tag')
  const speedIdx = colIndex('speed')
  const densityIdx = colIndex('density')
  const bzIdx = colIndex('bz')
  if (timeIdx === -1) return []

  const out: PswReading[] = []
  for (const row of parsed.data.slice(1)) {
    const timeCell = row[timeIdx]
    if (typeof timeCell !== 'string') continue
    out.push({
      time: timeCell,
      speed: speedIdx === -1 ? null : toNum(row[speedIdx] ?? null),
      density: densityIdx === -1 ? null : toNum(row[densityIdx] ?? null),
      bz: bzIdx === -1 ? null : toNum(row[bzIdx] ?? null),
    })
  }
  return out
}

async function fetchAndParse<T>(
  ctx: SwpcCacheCtx,
  key: string,
  url: string,
  parse: (json: unknown) => T[],
): Promise<T[]> {
  const res = await cachedJson(ctx, key, SWPC_CACHE_TTL_SECONDS, async () => {
    try {
      const upstream = await fetchUpstream(url, undefined, { timeoutMs: UPSTREAM_TIMEOUT_MS })
      if (!upstream.ok) {
        return upstreamError(upstream.status, `SWPC upstream ${upstream.status} for ${url}`)
      }
      const body = await upstream.text()
      return { body }
    } catch (err) {
      return upstreamError(503, `SWPC fetch failed for ${url}: ${String(err)}`)
    }
  })
  if (!res.ok) return []
  const json: unknown = await res.json()
  return parse(json)
}

/** Cached, parsed Kp readings — shared by solar-wind.ts. */
export function fetchKpReadings(ctx: SwpcCacheCtx): Promise<KpReading[]> {
  return fetchAndParse(ctx, 'noaa:kp:raw', KP_FEED, parseKp)
}

/** Cached, parsed 1-hour propagated solar wind rows — shared by solar-wind.ts and geomag.ts. */
export function fetchPswHour(ctx: SwpcCacheCtx): Promise<PswReading[]> {
  return fetchAndParse(ctx, 'noaa:psw-1h:raw', PSW_FEED, parsePsw)
}
