// Shared response-cache helper backed by the Cloudflare Cache API (`caches.default`).
//
// Why not KV: the free-tier KV budget is 1,000 writes/day. Every endpoint's cache
// TTL equals its client refetch interval, so under continuous polling nearly every
// request was a cache miss → a KV write, which blew the daily budget. The Cache API
// is free and unmetered for HTTP response caching. Trade-offs vs KV:
//   - per-colo, not global → more upstream fetches (free, and well within source
//     rate limits at this traffic);
//   - entries are evictable at any time → not durable storage. Anything that needs a
//     durable fallback (e.g. launches.ts's 7-day backup) must stay on KV.
//
// Underscore-prefixed filename so Pages does not route it as an endpoint.

const NEG_TTL_SECONDS = 60
const DEFAULT_TIMEOUT_MS = 8000

interface CacheCtx {
  // The Pages Function EventContext: we need the request (for an on-zone cache key)
  // and waitUntil (to store without blocking the response).
  request: { url: string }
  waitUntil(promise: Promise<unknown>): void
}

// A producer either yields a cacheable JSON body, or returns a raw Response.
// A 2xx Response is a producer-supplied pass-through (e.g. launches.ts's KV STALE
// fallback) returned uncached; a non-2xx Response is an error and gets negative-cached.
export type CacheableResult =
  | { body: string; ttl?: number; extraHeaders?: Record<string, string>; degraded?: boolean }
  | Response

/** Thrown by `fetchUpstream` on a timeout or network failure. Always maps to a 503. */
export class UpstreamError extends Error {
  readonly status = 503
  constructor(message: string) {
    super(message)
    this.name = 'UpstreamError'
  }
}

/**
 * `fetch` with a hard deadline. A hung upstream would otherwise pin the Function until
 * the platform kills it, so every upstream call gets an AbortSignal.timeout merged with
 * whatever signal the caller passed. Timeouts and network errors surface as UpstreamError.
 */
export async function fetchUpstream(
  url: string,
  init?: RequestInit,
  opts?: { timeoutMs?: number },
): Promise<Response> {
  const deadline = AbortSignal.timeout(opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const signal = init?.signal ? AbortSignal.any([init.signal, deadline]) : deadline
  try {
    return await fetch(url, { ...init, signal })
  } catch (err) {
    throw new UpstreamError(
      `Upstream fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

/**
 * Build a normalized error Response. The upstream's own status is never proxied: a
 * timeout / connection failure (0) or an upstream-side edge error (>= 520) becomes 503,
 * everything else becomes 502. `message` must be our own text, never upstream body text.
 */
export function upstreamError(status: number, message: string): Response {
  const normalized = status === 0 || status >= 520 ? 503 : 502
  return new Response(JSON.stringify({ error: message }), {
    status: normalized,
    headers: { 'Content-Type': 'application/json' },
  })
}

function normalizeStatus(status: number): number {
  return status === 0 || status >= 520 ? 503 : 502
}

// The Cache API only caches when the cache-key URL is on a hostname the zone serves.
// Derive the key from the incoming request's own origin so it is always on-zone
// (observatory.geektechlive.com in prod, *.pages.dev in previews) — an off-zone host
// makes cache.put() a silent no-op and every lookup a permanent miss.
function keyToRequest(origin: string, key: string): Request {
  return new Request(`${origin}/__cache/${encodeURIComponent(key)}`, { method: 'GET' })
}

/** Replay a stored positive entry, ageing its Cache-Control rather than resetting it. */
async function replayHit(hit: Response): Promise<Response> {
  const body = await hit.text()
  const headers = new Headers(hit.headers)
  headers.set('X-Cache', 'HIT')

  const ttl = Number(headers.get('X-Cache-TTL'))
  const effectiveTtl = Number.isFinite(ttl) && ttl > 0 ? ttl : 0
  const cachedAt = Number(headers.get('X-Cached-At'))
  // Entries written before X-Cached-At existed report age 0 and replay the full TTL,
  // rather than clamping every pre-rollout entry to max-age=0.
  const age =
    Number.isFinite(cachedAt) && cachedAt > 0
      ? Math.max(0, Math.floor((Date.now() - cachedAt) / 1000))
      : 0

  headers.set('Cache-Control', `public, max-age=${Math.max(0, effectiveTtl - age)}`)
  headers.set('X-Data-Age', String(age))
  // X-Data-Degraded, if the producer set it, rides along in the stored headers.
  return new Response(body, { status: 200, headers })
}

/** Replay a stored negative entry at its real status. */
async function replayNeg(negHit: Response): Promise<Response> {
  const body = await negHit.text()
  const headers = new Headers(negHit.headers)
  headers.set('X-Cache', 'NEG')
  const raw = Number(headers.get('X-Neg-Status'))
  const status = Number.isFinite(raw) && raw >= 400 && raw <= 599 ? raw : 503
  return new Response(body, { status, headers })
}

/**
 * Store a short-lived negative entry so a failing upstream is retried at most once per
 * minute instead of on every request. Stored at status 200 with the real status in
 * X-Neg-Status so the Cache API never rejects the entry.
 */
function storeNegative(
  ctx: CacheCtx,
  cache: Cache,
  negReq: Request,
  status: number,
  body: string,
): Response {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': `public, max-age=${NEG_TTL_SECONDS}`,
    'X-Cache-TTL': String(NEG_TTL_SECONDS),
    'X-Neg-Status': String(status),
  })
  ctx.waitUntil(cache.put(negReq, new Response(body, { status: 200, headers })))

  const out = new Headers(headers)
  out.set('X-Cache', 'NEG')
  return new Response(body, { status, headers: out })
}

/**
 * Cache-first JSON wrapper.
 *
 * Lookup order is positive key, then `${key}:neg`, so a negative entry can never shadow
 * a fresh good entry. On a positive hit the body replays with `X-Cache: HIT`, an aged
 * `Cache-Control: max-age` derived from the stored `X-Cached-At`, and `X-Data-Age`. On a
 * negative hit it replays with `X-Cache: NEG` at its stored status.
 *
 * On a miss `produce()` runs. A `{ body }` result is stored for its TTL and returned with
 * `X-Cache: MISS`; `degraded: true` adds `X-Data-Degraded: 1` to both the stored and the
 * returned headers and is cached for the FULL TTL (a degraded payload is still a real
 * answer, and re-fetching it sooner just multiplies upstream load). A 2xx `Response`
 * passes through uncached. A non-2xx `Response` or a thrown error is negative-cached
 * for 60s.
 *
 * @param ctx          context exposing `request` + `waitUntil` (the EventContext)
 * @param key          stable cache key (mirrors the old KV key)
 * @param ttlSeconds   default max-age; a producer may override via `result.ttl`
 * @param produce      builds the fresh payload on a cache miss
 */
export async function cachedJson(
  ctx: CacheCtx,
  key: string,
  ttlSeconds: number,
  produce: () => Promise<CacheableResult>,
): Promise<Response> {
  const cache = caches.default
  const origin = new URL(ctx.request.url).origin
  const cacheReq = keyToRequest(origin, key)
  const negReq = keyToRequest(origin, `${key}:neg`)

  const hit = await cache.match(cacheReq)
  if (hit) return replayHit(hit)

  const negHit = await cache.match(negReq)
  if (negHit) return replayNeg(negHit)

  let result: CacheableResult
  try {
    result = await produce()
  } catch (err) {
    console.warn(`[cache] producer threw for ${key}:`, err)
    return storeNegative(ctx, cache, negReq, 503, JSON.stringify({ error: 'Upstream unavailable' }))
  }

  if (result instanceof Response) {
    // 2xx: a producer-supplied pass-through (launches.ts's KV STALE body). Uncached, as before.
    if (result.ok) return result
    const body = (await result.text()) || JSON.stringify({ error: 'Upstream error' })
    return storeNegative(ctx, cache, negReq, normalizeStatus(result.status), body)
  }

  const effectiveTtl = result.ttl ?? ttlSeconds
  const baseHeaders = new Headers({
    'Content-Type': 'application/json',
    // Cache-Control drives Cache API eviction (max-age) just like KV's expirationTtl.
    'Cache-Control': `public, max-age=${effectiveTtl}`,
    'X-Cache-TTL': String(effectiveTtl),
    // Stored so a HIT can report real age instead of replaying the full TTL.
    'X-Cached-At': String(Date.now()),
    ...(result.extraHeaders ?? {}),
  })
  if (result.degraded === true) baseHeaders.set('X-Data-Degraded', '1')

  // The body is a string, so a fresh Response per consumer is enough; no clone needed.
  ctx.waitUntil(
    cache.put(cacheReq, new Response(result.body, { status: 200, headers: baseHeaders })),
  )

  const missHeaders = new Headers(baseHeaders)
  missHeaders.set('X-Cache', 'MISS')
  missHeaders.set('X-Data-Age', '0')
  return new Response(result.body, { status: 200, headers: missHeaders })
}
