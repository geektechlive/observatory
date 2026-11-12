import type { PagesFunction } from '@cloudflare/workers-types'

import { type KvCacheContext, type KvStreamReader, serveKvBodyCached } from './_kvBody'

// JPL Sentry's 50 highest Palermo scale impact-risk objects (#146). The refresh job
// (jpl-feeds.mjs) fetches the whole catalogue (2000+ objects), sorts and cuts it, and
// stores the finished body in KV; this handler only passes it through (_kvBody.ts). JPL
// asks for one request at a time, so it is never called from here.

/** KV key written by scripts/refresh-data.mjs. */
export const KV_SENTRY_KEY = 'jpl:sentry:v1'
/** The job rewrites it every run; the list changes rarely, so two days is still sound. */
export const FRESH_SECONDS = 48 * 3600

interface Env {
  OBSERVATORY_CACHE: KvStreamReader
}

export function serveSentry(
  ctx: KvCacheContext,
  kv: KvStreamReader,
  now = Date.now(),
): Promise<Response> {
  return serveKvBodyCached(
    ctx,
    kv,
    {
      key: KV_SENTRY_KEY,
      freshSeconds: FRESH_SECONDS,
      notYet: 'Sentry list not yet in KV: the refresh job writes it',
    },
    now,
  )
}

export const onRequest: PagesFunction<Env> = (ctx) => serveSentry(ctx, ctx.env.OBSERVATORY_CACHE)
