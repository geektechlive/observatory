// Shared response-cache helper backed by the Cloudflare Cache API (`caches.default`).
//
// Why not KV: the free-tier KV budget is 1,000 writes/day. Every endpoint's cache
// TTL equals its client refetch interval, so under continuous polling nearly every
// request was a cache miss → a KV write, which blew the daily budget. The Cache API
// is free and unmetered for HTTP response caching. Trade-offs vs KV:
//   - per-colo, not global → more upstream fetches (free, and well within source
//     rate limits at this traffic);
//   - entries are evictable at any time → not durable storage. Anything that needs a
//     durable fallback (e.g. the launches and TLE snapshots) must stay on KV.
//
// Underscore-prefixed filename so Pages does not route it as an endpoint.

const NEG_TTL_SECONDS = 60
const DEFAULT_TIMEOUT_MS = 8000
// A positive entry outlives its TTL by this much so it can be served, marked STALE,
// when the upstream fails. Freshness is decided in code from X-Cached-At, not by eviction.
const STALE_WINDOW_SECONDS = 86_400
// Browsers should come back soon for a STALE answer: the upstream may be back already.
const STALE_CLIENT_MAX_AGE_SECONDS = 60

/**
 * Why a producer failed. `contract` means the upstream answered but its payload broke our
 * schema (shape drift: retrying will not fix it, so monitors must fail fast). `upstream`
 * means it was unavailable (timeouts, 5xx: worth a retry). Sent as `X-Error-Kind`.
 */
export type ErrorKind = 'contract' | 'upstream'
const ERROR_KIND_HEADER = 'X-Error-Kind'

interface CacheCtx {
  // The Pages Function EventContext: we need the request (for an on-zone cache key)
  // and waitUntil (to store without blocking the response).
  request: { url: string }
  waitUntil(promise: Promise<unknown>): void
}

// A producer either yields a cacheable JSON body, or returns a raw Response.
// A 2xx Response is a producer-supplied pass-through returned uncached (no producer
// uses it today); a non-2xx Response is an error and gets negative-cached.
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
  return errorResponse(normalizeStatus(status), message, 'upstream')
}

/**
 * The upstream answered, but its payload failed our schema or parsed to nothing usable.
 * Always a 502, marked `X-Error-Kind: contract` so the health check never retries it and
 * never accepts a STALE fallback for it: shape drift has to alert.
 */
export function contractError(message: string): Response {
  return errorResponse(502, message, 'contract')
}

function errorResponse(status: number, message: string, kind: ErrorKind): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', [ERROR_KIND_HEADER]: kind },
  })
}

function normalizeStatus(status: number): number {
  return status === 0 || status >= 520 ? 503 : 502
}

function errorKindOf(res: Response): ErrorKind {
  return res.headers.get(ERROR_KIND_HEADER) === 'contract' ? 'contract' : 'upstream'
}

// The Cache API only caches when the cache-key URL is on a hostname the zone serves.
// Derive the key from the incoming request's own origin so it is always on-zone
// (observatory.geektechlive.com in prod, *.pages.dev in previews) — an off-zone host
// makes cache.put() a silent no-op and every lookup a permanent miss.
function keyToRequest(origin: string, key: string): Request {
  return new Request(`${origin}/__cache/${encodeURIComponent(key)}`, { method: 'GET' })
}

/** Age in whole seconds and the stored TTL of a positive entry. */
function entryTiming(entry: Response): { age: number; ttl: number } {
  const ttl = Number(entry.headers.get('X-Cache-TTL'))
  const cachedAt = Number(entry.headers.get('X-Cached-At'))
  // Entries written before X-Cached-At existed report age 0 and replay the full TTL,
  // rather than clamping every pre-rollout entry to max-age=0.
  const age =
    Number.isFinite(cachedAt) && cachedAt > 0
      ? Math.max(0, Math.floor((Date.now() - cachedAt) / 1000))
      : 0
  return { age, ttl: Number.isFinite(ttl) && ttl > 0 ? ttl : 0 }
}

/** Replay a stored positive entry, ageing its Cache-Control rather than resetting it. */
async function replayHit(hit: Response, age: number, ttl: number): Promise<Response> {
  const body = await hit.text()
  const headers = new Headers(hit.headers)
  headers.set('X-Cache', 'HIT')
  headers.set('Cache-Control', `public, max-age=${Math.max(0, ttl - age)}`)
  headers.set('X-Data-Age', String(age))
  // X-Data-Degraded, if the producer set it, rides along in the stored headers.
  return new Response(body, { status: 200, headers })
}

/**
 * Serve an expired positive entry because the upstream just failed. It is real data,
 * only old, so it goes out as a 200 marked STALE with why (`X-Stale-Status`,
 * `X-Error-Kind`) and how old (`X-Data-Age`), and the monitor decides whether that is OK.
 */
async function serveStale(
  stale: Response,
  age: number,
  status: number,
  kind: ErrorKind,
): Promise<Response> {
  const body = await stale.text()
  const headers = new Headers(stale.headers)
  headers.set('X-Cache', 'STALE')
  headers.set('Cache-Control', `public, max-age=${STALE_CLIENT_MAX_AGE_SECONDS}`)
  headers.set('X-Data-Age', String(age))
  headers.set('X-Stale-Status', String(status))
  headers.set(ERROR_KIND_HEADER, kind)
  return new Response(body, { status: 200, headers })
}

/** Status of a stored negative entry, clamped to a real error status. */
function negStatus(negHit: Response): number {
  const raw = Number(negHit.headers.get('X-Neg-Status'))
  return Number.isFinite(raw) && raw >= 400 && raw <= 599 ? raw : 503
}

/** Replay a stored negative entry at its real status. */
async function replayNeg(negHit: Response): Promise<Response> {
  const body = await negHit.text()
  const headers = new Headers(negHit.headers)
  headers.set('X-Cache', 'NEG')
  return new Response(body, { status: negStatus(negHit), headers })
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
  kind: ErrorKind,
): Response {
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': `public, max-age=${NEG_TTL_SECONDS}`,
    'X-Cache-TTL': String(NEG_TTL_SECONDS),
    'X-Neg-Status': String(status),
    [ERROR_KIND_HEADER]: kind,
  })
  ctx.waitUntil(cache.put(negReq, new Response(body, { status: 200, headers })))

  const out = new Headers(headers)
  out.set('X-Cache', 'NEG')
  return new Response(body, { status, headers: out })
}

/**
 * Cache-first JSON wrapper with stale-if-error.
 *
 * Lookup order is positive key, then `${key}:neg`, so a negative entry can never shadow
 * a fresh good entry. A positive entry younger than its TTL replays with `X-Cache: HIT`,
 * an aged `Cache-Control: max-age` derived from the stored `X-Cached-At`, and
 * `X-Data-Age`. Positive entries are stored for TTL + 24 h; past the TTL they are not
 * served as fresh, but are held as the stale fallback.
 *
 * On a miss `produce()` runs. A `{ body }` result is stored and returned with
 * `X-Cache: MISS`; `degraded: true` adds `X-Data-Degraded: 1` to both the stored and the
 * returned headers (a degraded payload is still a real answer). A 2xx `Response` passes
 * through uncached. A non-2xx `Response` or a thrown error is negative-cached for 60 s,
 * keeping its `X-Error-Kind`.
 *
 * When the producer fails, or a negative entry is live, and an expired positive entry
 * exists, that entry is served as `X-Cache: STALE` (see `serveStale`) instead of the error.
 *
 * @param ctx          context exposing `request` + `waitUntil` (the EventContext)
 * @param key          stable cache key (mirrors the old KV key)
 * @param ttlSeconds   default freshness; a producer may override via `result.ttl`
 * @param produce      builds the fresh payload on a cache miss
 * @param opts.staleIfError  false for an inner raw-feed cache nested in a handler's own
 *                     cache: a STALE raw body would be parsed and re-cached by the outer
 *                     layer as a fresh MISS, hiding its age. Failures then surface as before.
 */
export async function cachedJson(
  ctx: CacheCtx,
  key: string,
  ttlSeconds: number,
  produce: () => Promise<CacheableResult>,
  opts: { staleIfError?: boolean } = {},
): Promise<Response> {
  const cache = caches.default
  const origin = new URL(ctx.request.url).origin
  const cacheReq = keyToRequest(origin, key)
  const negReq = keyToRequest(origin, `${key}:neg`)

  const hit = await cache.match(cacheReq)
  const timing = hit ? entryTiming(hit) : undefined
  if (hit && timing && timing.age <= timing.ttl) return replayHit(hit, timing.age, timing.ttl)
  const stale =
    hit && timing && opts.staleIfError !== false ? { entry: hit, age: timing.age } : undefined

  const negHit = await cache.match(negReq)
  if (negHit) {
    return stale
      ? serveStale(stale.entry, stale.age, negStatus(negHit), errorKindOf(negHit))
      : replayNeg(negHit)
  }

  let result: CacheableResult
  try {
    result = await produce()
  } catch (err) {
    console.warn(`[cache] producer threw for ${key}:`, err)
    // An unparseable body (upstream.json() on an HTML 200) is shape drift, not an outage.
    const isContract = err instanceof SyntaxError
    const status = isContract ? 502 : 503
    const kind: ErrorKind = isContract ? 'contract' : 'upstream'
    const body = JSON.stringify({
      error: isContract ? 'Invalid upstream response' : 'Upstream unavailable',
    })
    const neg = storeNegative(ctx, cache, negReq, status, body, kind)
    return stale ? serveStale(stale.entry, stale.age, status, kind) : neg
  }

  if (result instanceof Response) {
    // 2xx: a producer-supplied pass-through, returned uncached.
    if (result.ok) return result
    const status = normalizeStatus(result.status)
    const kind = errorKindOf(result)
    const body = (await result.text()) || JSON.stringify({ error: 'Upstream error' })
    const neg = storeNegative(ctx, cache, negReq, status, body, kind)
    return stale ? serveStale(stale.entry, stale.age, status, kind) : neg
  }

  const effectiveTtl = result.ttl ?? ttlSeconds
  const baseHeaders = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': `public, max-age=${effectiveTtl}`,
    'X-Cache-TTL': String(effectiveTtl),
    // Stored so a HIT can report real age instead of replaying the full TTL.
    'X-Cached-At': String(Date.now()),
    ...(result.extraHeaders ?? {}),
  })
  if (result.degraded === true) baseHeaders.set('X-Data-Degraded', '1')

  // The stored copy lives past its TTL (Cache-Control drives Cache API eviction) so it
  // can back a STALE answer; the copy returned to the client keeps the plain TTL.
  const storedHeaders = new Headers(baseHeaders)
  storedHeaders.set('Cache-Control', `public, max-age=${effectiveTtl + STALE_WINDOW_SECONDS}`)
  // The body is a string, so a fresh Response per consumer is enough; no clone needed.
  ctx.waitUntil(
    cache.put(cacheReq, new Response(result.body, { status: 200, headers: storedHeaders })),
  )

  const missHeaders = new Headers(baseHeaders)
  missHeaders.set('X-Cache', 'MISS')
  missHeaders.set('X-Data-Age', '0')
  return new Response(result.body, { status: 200, headers: missHeaders })
}
