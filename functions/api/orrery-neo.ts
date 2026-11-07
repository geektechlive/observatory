import type { PagesFunction } from '@cloudflare/workers-types'

import { type KvStreamReader, serveKvBody } from './_kvBody'

// The orrery's close approaches (#92): this fortnight's CAD objects placed with JPL
// Horizons, JPL Scout's unconfirmed objects and ESA NEOCC's lists, built by
// scripts/refresh-data.mjs (orrery-neo.mjs) every 6 h and stored in KV as the finished
// response body. Streamed through unparsed (_kvBody.ts); JPL is never called here,
// because it refuses overlapping requests (#88) and every visitor would be one.

/** KV key written by scripts/refresh-data.mjs. */
export const KV_ORRERY_NEO_KEY = 'horizons:neo:v1'
/** The approach list changes daily; past 36 h the copy is degraded. */
export const FRESH_SECONDS = 36 * 3600

interface Env {
  OBSERVATORY_CACHE: KvStreamReader
}

export function serveOrreryNeo(kv: KvStreamReader, now = Date.now()): Promise<Response> {
  return serveKvBody(
    kv,
    {
      key: KV_ORRERY_NEO_KEY,
      freshSeconds: FRESH_SECONDS,
      notYet: 'Close approaches not yet in KV: the refresh job writes them',
    },
    now,
  )
}

export const onRequest: PagesFunction<Env> = (ctx) => serveOrreryNeo(ctx.env.OBSERVATORY_CACHE)
