import type { PagesFunction } from '@cloudflare/workers-types'

import { type KvCacheContext, type KvStreamReader, serveKvBodyCached } from './_kvBody'

// The 30 most recent fireballs JPL reports (#146). The refresh job (jpl-feeds.mjs) maps
// JPL's column table to named rows and stores the finished body in KV; this handler only
// passes it through (_kvBody.ts). JPL asks for one request at a time, so it is never
// called from here.

/** KV key written by scripts/refresh-data.mjs. */
export const KV_FIREBALL_KEY = 'jpl:fireball:v1'
/** The job rewrites it every run; new events are rare, so two days is still sound. */
export const FRESH_SECONDS = 48 * 3600

interface Env {
  OBSERVATORY_CACHE: KvStreamReader
}

export function serveFireball(
  ctx: KvCacheContext,
  kv: KvStreamReader,
  now = Date.now(),
): Promise<Response> {
  return serveKvBodyCached(
    ctx,
    kv,
    {
      key: KV_FIREBALL_KEY,
      freshSeconds: FRESH_SECONDS,
      notYet: 'Fireballs not yet in KV: the refresh job writes them',
    },
    now,
  )
}

export const onRequest: PagesFunction<Env> = (ctx) => serveFireball(ctx, ctx.env.OBSERVATORY_CACHE)
