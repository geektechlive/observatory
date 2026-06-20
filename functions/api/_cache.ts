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

interface CacheCtx {
  // The Pages Function EventContext: we need the request (for an on-zone cache key)
  // and waitUntil (to store without blocking the response).
  request: { url: string }
  waitUntil(promise: Promise<unknown>): void
}

// A producer either yields a cacheable JSON body, or returns a raw Response for an
// error/edge case that must be passed through WITHOUT being cached.
export type CacheableResult =
  | { body: string; ttl?: number; extraHeaders?: Record<string, string> }
  | Response

// The Cache API only caches when the cache-key URL is on a hostname the zone serves.
// Derive the key from the incoming request's own origin so it is always on-zone
// (observatory.geektechlive.com in prod, *.pages.dev in previews) — an off-zone host
// makes cache.put() a silent no-op and every lookup a permanent miss.
function keyToRequest(origin: string, key: string): Request {
  return new Request(`${origin}/__cache/${encodeURIComponent(key)}`, { method: 'GET' })
}

/**
 * Cache-first JSON wrapper. On a hit, returns the stored body with `X-Cache: HIT`.
 * On a miss, runs `produce()`: a raw `Response` (error) is returned uncached; a
 * `{ body }` result is stored via `waitUntil` and returned with `X-Cache: MISS`.
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

  const hit = await cache.match(cacheReq)
  if (hit) {
    const headers = new Headers(hit.headers)
    headers.set('X-Cache', 'HIT')
    return new Response(hit.body, { status: 200, headers })
  }

  const result = await produce()
  if (result instanceof Response) return result // error/edge case — do not cache

  const effectiveTtl = result.ttl ?? ttlSeconds
  const baseHeaders = new Headers({
    'Content-Type': 'application/json',
    // Cache-Control drives Cache API eviction (max-age) just like KV's expirationTtl.
    'Cache-Control': `public, max-age=${effectiveTtl}`,
    'X-Cache-TTL': String(effectiveTtl),
    ...(result.extraHeaders ?? {}),
  })

  // Store a clone (the body stream can only be consumed once).
  const toStore = new Response(result.body, { status: 200, headers: baseHeaders })
  ctx.waitUntil(cache.put(cacheReq, toStore.clone()))

  const missHeaders = new Headers(baseHeaders)
  missHeaders.set('X-Cache', 'MISS')
  return new Response(result.body, { status: 200, headers: missHeaders })
}
