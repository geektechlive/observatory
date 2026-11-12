import { upstreamError } from './_cache'

// A finished response body the refresh job wrote to KV (#93, #92), streamed through
// unparsed: the bodies run to hundreds of KB and the Worker has 10 ms of CPU. Its age
// comes from the KV metadata written in the same PUT (`fetchedAt`).

const CACHE_SECONDS = 600
const DEGRADED_CACHE_SECONDS = 300

export interface KvStreamReader {
  getWithMetadata: (
    key: string,
    opts: { type: 'stream' },
  ) => Promise<{ value: ReadableStream | null; metadata: unknown }>
}

export interface KvBodySpec {
  key: string
  /** Older than this (or undated), the copy is served degraded. */
  freshSeconds: number
  /** The 503 message while the refresh job has not written the key yet. */
  notYet: string
}

function fetchedAtMs(metadata: unknown): number {
  if (typeof metadata !== 'object' || metadata === null) return Number.NaN
  const at = (metadata as { fetchedAt?: unknown }).fetchedAt
  return typeof at === 'string' ? Date.parse(at) : Number.NaN
}

export async function serveKvBody(
  kv: KvStreamReader,
  spec: KvBodySpec,
  now = Date.now(),
): Promise<Response> {
  const { value, metadata } = await kv.getWithMetadata(spec.key, { type: 'stream' })
  if (!value) {
    // Not an outage of ours: the refresh job has not written the key yet (#146). Say who
    // would have served it (#71), or its first run after a deploy pages at once.
    const notYet = upstreamError(0, spec.notYet)
    notYet.headers.set('X-Data-Source', 'kv')
    return notYet
  }

  const at = fetchedAtMs(metadata)
  const ageSeconds = Number.isFinite(at) ? Math.max(0, Math.floor((now - at) / 1000)) : null
  const fresh = ageSeconds !== null && ageSeconds <= spec.freshSeconds
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': `public, max-age=${String(fresh ? CACHE_SECONDS : DEGRADED_CACHE_SECONDS)}`,
    'X-Data-Source': fresh ? 'kv' : 'kv-backup',
  })
  if (ageSeconds !== null) headers.set('X-Data-Age', String(ageSeconds))
  if (!fresh) {
    // Old or undated: still the best data we have, so served, but said why (#71).
    headers.set('X-Data-Degraded', '1')
    headers.set('X-Error-Kind', 'upstream')
  }
  return new Response(value, { status: 200, headers })
}

/** The slice of a Pages Function context the Cache API layer needs. */
export interface KvCacheContext {
  request: { url: string }
  waitUntil: (promise: Promise<unknown>) => void
}

/**
 * `serveKvBody` behind the Cache API (#146), for the small feeds every visitor asks for
 * (planets, Sentry, fireball): a burst costs one KV read per data centre per
 * CACHE_SECONDS instead of one per request. Only a 200 is stored, so the "not yet in
 * KV" 503 is seen again at once and the first refresh run shows without a purge. The key
 * is on the request's own origin, or `put` is a silent no-op (_cache.ts).
 */
export async function serveKvBodyCached(
  ctx: KvCacheContext,
  kv: KvStreamReader,
  spec: KvBodySpec,
  now = Date.now(),
): Promise<Response> {
  const cache = caches.default
  const key = new Request(`${new URL(ctx.request.url).origin}/__kv/${encodeURIComponent(spec.key)}`)
  const hit = await cache.match(key)
  if (hit) return hit
  const res = await serveKvBody(kv, spec, now)
  if (res.status === 200) ctx.waitUntil(cache.put(key, res.clone()))
  return res
}
