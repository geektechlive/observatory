import type { PagesFunction } from '@cloudflare/workers-types'

import { LaunchesResponseSchema } from '../../src/schemas/launches'
import type { CacheableResult } from './_cache'
import { cachedJson, contractError, fetchUpstream, upstreamError } from './_cache'
import type { KvReader } from './iss-tle'
import { readKvEnvelope } from './iss-tle'

// KV-first launch data (#30).
//
// RocketLaunch.live stopped answering Cloudflare Workers egress (2026-10-09: every
// preview request fell back to KV) while it still answers laptops and GitHub runners,
// the same pattern as CelesTrak in 2026-09. scripts/refresh-data.mjs already fetches
// RLL from a runner every 6 h and writes the envelope below, so that copy is the
// primary source. This handler only READS KV: request-path KV writes would burn the
// free plan's 1,000 writes/day.
//
// Order: KV younger than KV_FRESH_SECONDS, then a live RLL fetch (kept in case the
// block lifts), then the older KV copy marked degraded, then an error.

const CACHE_TTL_SECONDS = 1800 // 30 min
/** Short, so a degraded answer stops being replayed soon after KV is refreshed. */
const DEGRADED_TTL_SECONDS = 300
const UPSTREAM_TIMEOUT_MS = 10_000
const RLL_URL = 'https://fdo.rocketlaunch.live/json/launches/next/5'

/** KV key written by scripts/refresh-data.mjs. */
export const KV_LAUNCHES_KEY = 'rll:launches:next:v1:backup'
/** Two refresh runs (every 6 h) may be missed before the KV copy stops being primary. */
export const KV_FRESH_SECONDS = 12 * 3600

interface Env {
  OBSERVATORY_CACHE: KVNamespace
}

type FetchUpstream = typeof fetchUpstream

/** Live RLL fetch. Returns the payload, or an error Response saying why it failed. */
async function fetchLive(fetchImpl: FetchUpstream): Promise<CacheableResult> {
  let upstream: Response
  try {
    upstream = await fetchImpl(
      RLL_URL,
      { headers: { Accept: 'application/json' } },
      { timeoutMs: UPSTREAM_TIMEOUT_MS },
    )
  } catch (err) {
    console.warn(
      `[launches] RLL live fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    )
    return upstreamError(503, 'Launch data upstream unavailable')
  }

  if (!upstream.ok) {
    console.warn(`[launches] RLL live fetch: HTTP ${String(upstream.status)}`)
    return upstreamError(upstream.status, `Launch data error: ${String(upstream.status)}`)
  }

  let raw: unknown
  try {
    raw = await upstream.json()
  } catch {
    console.warn('[launches] RLL live fetch: body is not JSON')
    return contractError('Launch data upstream returned invalid JSON')
  }
  const parsed = LaunchesResponseSchema.safeParse(raw)
  if (!parsed.success) {
    console.warn('[launches] RLL live fetch: payload failed the schema')
    return contractError('Invalid upstream response')
  }
  return {
    body: JSON.stringify(parsed.data),
    extraHeaders: { 'X-Data-Source': 'live', 'X-Data-Age': '0' },
  }
}

/**
 * Build the /api/launches payload. Exported so tests can drive every branch with a
 * fake KV and a fake fetch, without the Cache API.
 */
export async function produceLaunches(
  kv: KvReader | undefined,
  fetchImpl: FetchUpstream = fetchUpstream,
  now: number = Date.now(),
): Promise<CacheableResult> {
  const cached = await readKvEnvelope<unknown>(kv, KV_LAUNCHES_KEY, now)
  const validated = cached ? LaunchesResponseSchema.safeParse(cached.data) : null
  const kvCopy =
    cached && validated?.success ? { data: validated.data, age: cached.ageSeconds } : null

  if (kvCopy && kvCopy.age <= KV_FRESH_SECONDS) {
    return {
      body: JSON.stringify(kvCopy.data),
      extraHeaders: { 'X-Data-Source': 'kv', 'X-Data-Age': String(kvCopy.age) },
    }
  }

  const live = await fetchLive(fetchImpl)
  if (!(live instanceof Response) || !kvCopy) return live

  // Live failed but an older KV copy exists: real data, past its fresh window.
  return {
    body: JSON.stringify(kvCopy.data),
    ttl: DEGRADED_TTL_SECONDS,
    degraded: true,
    extraHeaders: { 'X-Data-Source': 'kv-backup', 'X-Data-Age': String(kvCopy.age) },
  }
}

export const onRequest: PagesFunction<Env> = (ctx) =>
  cachedJson(ctx, 'rll:launches:next:v1', CACHE_TTL_SECONDS, () =>
    produceLaunches(ctx.env.OBSERVATORY_CACHE),
  )
