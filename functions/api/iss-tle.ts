import type { PagesFunction } from '@cloudflare/workers-types'

import type { IssTle } from '../../src/schemas/iss-tle'
import { IssTleSchema } from '../../src/schemas/iss-tle'
import type { CacheableResult } from './_cache'
import { cachedJson, fetchUpstream } from './_cache'

// KV-first TLE serving.
//
// CelesTrak returns HTTP 522 to Cloudflare Workers egress (observed from about
// 2026-09-03), which killed both /api/iss-tle and /api/satellites. The durable fix
// is out-of-band: a scheduled GitHub Action (scripts/refresh-data.mjs) fetches the
// TLEs from an ordinary network and writes them to Workers KV. Handlers only ever
// READ KV. They must never write it: the free plan allows 1,000 writes/day and a
// write on the request path burns that budget in minutes.
//
// Order of preference: fresh KV, then a best-effort live CelesTrak fetch (still
// wired up in case the block lifts or a preview runs from a different egress),
// then stale KV, then a hardcoded fallback.

const CELESTRAK_URL = 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=TLE'

/** KV key written by scripts/refresh-data.mjs. */
export const KV_ISS_TLE_KEY = 'tle:iss:v1'

/** A KV snapshot older than this is considered stale and only used as a last resort. */
export const KV_MAX_AGE_SECONDS = 3 * 24 * 3600

/** Cache API TTL for a good answer. TLEs are refreshed twice a day upstream. */
export const FRESH_TTL_SECONDS = 3600

/**
 * Cache API TTL for a degraded answer. Deliberately short: extraHeaders are frozen
 * into the cached entry and replayed on every HIT, so a long TTL would keep serving
 * "fallback" (and a stale X-Data-Age) for an hour after KV recovers.
 */
export const DEGRADED_TTL_SECONDS = 300

const LIVE_TIMEOUT_MS = 10_000

/**
 * Last-resort ISS TLE. Fetched from CelesTrak on 2026-09-07 (epoch 26250.17589239).
 * SGP4 accuracy decays roughly a few km/day from epoch, so this is only useful for a
 * rough position while the refresh job is broken. Responses using it are marked
 * degraded so the health check catches it.
 */
export const FALLBACK_TLE: IssTle = {
  name: 'ISS (ZARYA)',
  line1: '1 25544U 98067A   26250.17589239  .00004561  00000+0  90859-4 0  9999',
  line2: '2 25544  51.6308 254.3052 0005020 115.4261 244.7248 15.49013499584466',
}

/** Minimal structural view of a KV namespace. Keeps fakes trivial in tests. */
export interface KvReader {
  get(key: string): Promise<string | null>
}

/** Envelope shape written by scripts/refresh-data.mjs. */
export interface KvEnvelope<T> {
  fetchedAt: string
  source: string
  data: T
}

export interface KvHit<T> {
  data: T
  fetchedAt: string
  ageSeconds: number
  fresh: boolean
}

/**
 * Read and validate a `{ fetchedAt, source, data }` envelope from KV.
 *
 * Shared by iss-tle.ts and satellites.ts (satellites imports it from here rather
 * than duplicating it). Returns null for every failure mode: no binding, missing
 * key, unreadable KV, non-JSON, wrong shape, unparseable timestamp.
 */
export async function readKvEnvelope<T>(
  kv: KvReader | undefined,
  key: string,
  now: number = Date.now(),
): Promise<KvHit<T> | null> {
  if (!kv) return null

  let raw: string | null
  try {
    raw = await kv.get(key)
  } catch {
    return null
  }
  if (raw === null) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null

  const envelope = parsed as Partial<KvEnvelope<T>>
  if (typeof envelope.fetchedAt !== 'string' || envelope.data === undefined) return null

  const fetchedMs = Date.parse(envelope.fetchedAt)
  if (Number.isNaN(fetchedMs)) return null

  const ageSeconds = Math.max(0, Math.round((now - fetchedMs) / 1000))
  return {
    data: envelope.data,
    fetchedAt: envelope.fetchedAt,
    ageSeconds,
    fresh: ageSeconds <= KV_MAX_AGE_SECONDS,
  }
}

/** Parse CelesTrak's 3-line TLE text block. Structural checks only. */
export function parseTle(text: string): IssTle | null {
  const lines = text
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  if (lines.length < 3) return null

  const [name, line1, line2] = lines
  if (!name || !line1 || !line2) return null
  if (!line1.startsWith('1 ') || !line2.startsWith('2 ')) return null
  return { name, line1, line2 }
}

type FetchUpstream = typeof fetchUpstream

interface Env {
  OBSERVATORY_CACHE: KVNamespace
}

/**
 * Build the /api/iss-tle payload. Exported so tests can drive every branch with a
 * fake KV and a fake fetch, without stubbing the Cache API.
 */
export async function produceIssTle(
  kv: KvReader | undefined,
  fetchImpl: FetchUpstream = fetchUpstream,
  now: number = Date.now(),
): Promise<CacheableResult> {
  const cached = await readKvEnvelope<unknown>(kv, KV_ISS_TLE_KEY, now)

  if (cached && cached.fresh) {
    const validated = IssTleSchema.safeParse(cached.data)
    if (validated.success) {
      return {
        body: JSON.stringify(validated.data),
        ttl: FRESH_TTL_SECONDS,
        extraHeaders: {
          'X-Data-Source': 'kv',
          'X-Data-Age': String(cached.ageSeconds),
        },
      }
    }
  }

  try {
    const upstream = await fetchImpl(CELESTRAK_URL, undefined, { timeoutMs: LIVE_TIMEOUT_MS })
    if (upstream.ok) {
      const live = parseTle(await upstream.text())
      const validated = live ? IssTleSchema.safeParse(live) : null
      if (validated?.success) {
        return {
          body: JSON.stringify(validated.data),
          ttl: FRESH_TTL_SECONDS,
          extraHeaders: { 'X-Data-Source': 'live', 'X-Data-Age': '0' },
        }
      }
    }
  } catch {
    // Timeout or network error. Fall through to the stale/fallback path.
  }

  if (cached) {
    const validated = IssTleSchema.safeParse(cached.data)
    if (validated.success) {
      return {
        body: JSON.stringify(validated.data),
        ttl: DEGRADED_TTL_SECONDS,
        degraded: true,
        extraHeaders: {
          'X-Data-Source': 'kv-stale',
          'X-Data-Age': String(cached.ageSeconds),
        },
      }
    }
  }

  return {
    body: JSON.stringify(FALLBACK_TLE),
    ttl: DEGRADED_TTL_SECONDS,
    degraded: true,
    extraHeaders: { 'X-Data-Source': 'fallback' },
  }
}

export const onRequest: PagesFunction<Env> = (ctx) =>
  cachedJson(ctx, 'nasa:iss-tle', FRESH_TTL_SECONDS, () => produceIssTle(ctx.env.OBSERVATORY_CACHE))
