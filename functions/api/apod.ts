import type { PagesFunction } from '@cloudflare/workers-types'

import { type Apod, ApodSchema } from '../../src/schemas/apod'
import type { CacheableResult } from './_cache'
import { cachedJson, contractError, fetchUpstream, upstreamError } from './_cache'
import type { KvReader } from './iss-tle'
import { readKvEnvelope } from './iss-tle'

// KV-first APOD (#72).
//
// apod.nasa.gov now 301s to science.nasa.gov/apod/, and NASA's APOD API still scrapes
// the old page: on 2026-10-25 it answered today's explanation with the title "NASA
// Science" and the NASA logo as url. scripts/refresh-data.mjs reads the new pages from
// a runner every 6 h and writes the envelope below. This handler only READS KV.
//
// Order: KV younger than KV_APOD_FRESH_SECONDS, then NASA's API (kept for when NASA
// fixes it), then the older KV copy marked degraded with why, then an error.

const NASA_API_BASE = 'https://api.nasa.gov'
/** A KV answer: short enough that a new day's copy shows within the hour. */
const KV_TTL_SECONDS = 3600
/** Short, so a degraded answer stops being replayed soon after KV is refreshed. */
const DEGRADED_TTL_SECONDS = 300

/** KV key written by scripts/refresh-data.mjs. */
export const KV_APOD_KEY = 'apod:science:v1'
/** Two refresh runs (every 6 h) may be missed before the KV copy stops being primary. */
export const KV_APOD_FRESH_SECONDS = 12 * 3600

// Only these hosts are allowed through for url/hdurl — anything else is nulled
// server-side before the client ever sees it. Mirrored in the CSP img-src.
const ALLOWED_MEDIA_HOSTS = [
  'https://apod.nasa.gov/',
  'https://assets.science.nasa.gov/',
  'https://www.youtube.com/',
  'https://youtube.com/',
  'https://player.vimeo.com/',
]

/** NASA's API answers this when its scraper finds the new site's header, not the picture. */
const isPlaceholder = (apod: Apod) =>
  apod.title === 'NASA Science' || /\/nasa-logo[^/]*$/.test(apod.url)

interface Env {
  NASA_API_KEY: string
  OBSERVATORY_CACHE: KVNamespace
}

type FetchUpstream = typeof fetchUpstream

function midnightUtcMs(now: number): number {
  const d = new Date(now)
  const midnight = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1)
  return Math.floor((midnight - now) / 1000)
}

function allowedOrNull(url: string | undefined): string | null {
  if (url === undefined) return null
  return ALLOWED_MEDIA_HOSTS.some((host) => url.startsWith(host)) ? url : null
}

function toBody(apod: Apod, now: number): string {
  return JSON.stringify({
    ...apod,
    url: allowedOrNull(apod.url),
    hdurl: allowedOrNull(apod.hdurl),
    updatedAt: new Date(now).toISOString(),
  })
}

/** NASA's APOD API. Returns the picture, or an error Response saying why it failed. */
async function fetchNasa(
  apiKey: string,
  fetchImpl: FetchUpstream,
  now: number,
): Promise<CacheableResult> {
  let upstream: Response
  try {
    upstream = await fetchImpl(`${NASA_API_BASE}/planetary/apod?api_key=${apiKey}`)
  } catch {
    return upstreamError(0, 'NASA APOD upstream unavailable')
  }
  if (!upstream.ok) return upstreamError(upstream.status, 'NASA APOD upstream error')

  let raw: unknown
  try {
    raw = await upstream.json()
  } catch {
    return contractError('NASA APOD returned invalid JSON')
  }
  const parsed = ApodSchema.safeParse(raw)
  if (!parsed.success) {
    console.warn('[apod] invalid upstream response', parsed.error.issues)
    return contractError('Invalid APOD response')
  }
  if (isPlaceholder(parsed.data)) {
    console.warn('[apod] NASA API answered its placeholder (title or url is the NASA logo)')
    return contractError('NASA APOD answered a placeholder, not a picture')
  }

  // Note: accurate only on a cache MISS — a HIT serves the header value that
  // was current at write time, not NASA's live remaining count.
  const extraHeaders: Record<string, string> = { 'X-Data-Source': 'nasa-api' }
  const quota = upstream.headers.get('X-RateLimit-Remaining')
  if (quota !== null) extraHeaders['X-Quota-Remaining'] = quota

  // Cache until next UTC midnight: APOD changes once per UTC day.
  return { body: toBody(parsed.data, now), ttl: Math.max(midnightUtcMs(now), 60), extraHeaders }
}

/**
 * Build the /api/apod payload. Exported so tests can drive every branch with a fake KV
 * and a fake fetch, without the Cache API.
 */
export async function produceApod(
  kv: KvReader | undefined,
  apiKey: string,
  fetchImpl: FetchUpstream = fetchUpstream,
  now: number = Date.now(),
): Promise<CacheableResult> {
  const cached = await readKvEnvelope<unknown>(kv, KV_APOD_KEY, now)
  const validated = cached ? ApodSchema.safeParse(cached.data) : null
  const kvCopy =
    cached && validated?.success ? { data: validated.data, age: cached.ageSeconds } : null

  if (kvCopy && kvCopy.age <= KV_APOD_FRESH_SECONDS) {
    return {
      body: toBody(kvCopy.data, now),
      ttl: KV_TTL_SECONDS,
      extraHeaders: { 'X-Data-Source': 'kv', 'X-Data-Age': String(kvCopy.age) },
    }
  }

  const live = await fetchNasa(apiKey, fetchImpl, now)
  if (!(live instanceof Response) || !kvCopy) return live

  // NASA failed but an older KV copy exists: a real picture, past its fresh window.
  // Say why, so the health check holds an outage but alerts on drift (#71).
  return {
    body: toBody(kvCopy.data, now),
    ttl: DEGRADED_TTL_SECONDS,
    degraded: true,
    extraHeaders: {
      'X-Data-Source': 'kv-backup',
      'X-Data-Age': String(kvCopy.age),
      'X-Error-Kind': live.headers.get('X-Error-Kind') ?? 'upstream',
    },
  }
}

/**
 * One stable key, not one per UTC date (#61): after its ttl the entry is the stale
 * fallback, so an outage serves the last picture marked STALE instead of an error.
 * v2 (#72): v1 entries hold NASA's logo placeholder with a TTL to midnight, and a HIT
 * trusts the stored TTL, so they would have outlived the deploy.
 */
const CACHE_KEY = 'nasa:apod:latest:v2'

export const onRequest: PagesFunction<Env> = (ctx) => {
  return cachedJson(ctx, CACHE_KEY, KV_TTL_SECONDS, () => {
    if (!ctx.env.NASA_API_KEY)
      console.warn('[apod] NASA_API_KEY missing — falling back to DEMO_KEY (rate-limited)')
    return produceApod(ctx.env.OBSERVATORY_CACHE, ctx.env.NASA_API_KEY || 'DEMO_KEY')
  })
}
