import type { PagesFunction } from '@cloudflare/workers-types'

import { type KvStreamReader, serveKvBody } from './_kvBody'

// The orrery's craft, Earth and Moon (#93), sampled from JPL Horizons by
// scripts/refresh-data.mjs every 6 h and stored in KV as the finished response body.
//
// This handler never parses that body: it is ~420 KB, and the Worker has 10 ms of CPU.
// It streams it through and reads the body's age from the KV metadata written with it
// in the same PUT (_kvBody.ts). Horizons itself is never called here: it refuses
// overlapping requests (#88), and every visitor would be one.

/** KV key written by scripts/refresh-data.mjs. */
export const KV_ORRERY_BODIES_KEY = 'horizons:bodies:v1'
/** The refresh job keeps the spans 30 days wide; past 72 h the copy is degraded. */
export const FRESH_SECONDS = 72 * 3600

interface Env {
  OBSERVATORY_CACHE: KvStreamReader
}

export function serveOrreryBodies(kv: KvStreamReader, now = Date.now()): Promise<Response> {
  return serveKvBody(
    kv,
    {
      key: KV_ORRERY_BODIES_KEY,
      freshSeconds: FRESH_SECONDS,
      notYet: 'Orrery bodies not yet in KV: the refresh job writes them',
    },
    now,
  )
}

export const onRequest: PagesFunction<Env> = (ctx) => serveOrreryBodies(ctx.env.OBSERVATORY_CACHE)
