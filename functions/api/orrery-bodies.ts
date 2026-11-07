import type { PagesFunction } from '@cloudflare/workers-types'

import { upstreamError } from './_cache'

// The orrery's craft, Earth and Moon (#93), sampled from JPL Horizons by
// scripts/refresh-data.mjs every 6 h and stored in KV as the finished response body.
//
// This handler never parses that body: it is ~180 KB, and the Worker has 10 ms of CPU.
// It streams it through and reads the body's age from the KV metadata written with it
// in the same PUT. Horizons itself is never called here: it refuses overlapping
// requests (#88), and every visitor would be one.

/** KV key written by scripts/refresh-data.mjs. */
export const KV_ORRERY_BODIES_KEY = 'horizons:bodies:v1'
/** The refresh job keeps the spans 30 days wide; past 72 h the copy is degraded. */
export const FRESH_SECONDS = 72 * 3600
const CACHE_SECONDS = 600
const DEGRADED_CACHE_SECONDS = 300

export interface KvStreamReader {
  getWithMetadata: (
    key: string,
    opts: { type: 'stream' },
  ) => Promise<{ value: ReadableStream | null; metadata: unknown }>
}

interface Env {
  OBSERVATORY_CACHE: KvStreamReader
}

function fetchedAtMs(metadata: unknown): number {
  if (typeof metadata !== 'object' || metadata === null) return Number.NaN
  const at = (metadata as { fetchedAt?: unknown }).fetchedAt
  return typeof at === 'string' ? Date.parse(at) : Number.NaN
}

export async function serveOrreryBodies(kv: KvStreamReader, now = Date.now()): Promise<Response> {
  const { value, metadata } = await kv.getWithMetadata(KV_ORRERY_BODIES_KEY, { type: 'stream' })
  if (!value) return upstreamError(0, 'Orrery bodies not yet in KV: the refresh job writes them')

  const at = fetchedAtMs(metadata)
  const ageSeconds = Number.isFinite(at) ? Math.max(0, Math.floor((now - at) / 1000)) : null
  const fresh = ageSeconds !== null && ageSeconds <= FRESH_SECONDS
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': `public, max-age=${String(fresh ? CACHE_SECONDS : DEGRADED_CACHE_SECONDS)}`,
    'X-Data-Source': fresh ? 'kv' : 'kv-backup',
  })
  if (ageSeconds !== null) headers.set('X-Data-Age', String(ageSeconds))
  if (!fresh) {
    // Old or undated: still the best positions we have, so served, but said why (#71).
    headers.set('X-Data-Degraded', '1')
    headers.set('X-Error-Kind', 'upstream')
  }
  return new Response(value, { status: 200, headers })
}

export const onRequest: PagesFunction<Env> = (ctx) => serveOrreryBodies(ctx.env.OBSERVATORY_CACHE)
