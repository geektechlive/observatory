import type { PagesFunction } from '@cloudflare/workers-types'

import { type KvCacheContext, type KvStreamReader, serveKvBodyCached } from './_kvBody'

// The Sky view's Sun, Moon and planets: the geocentric position for the UTC date of the
// last refresh run, from JPL Horizons (#146). scripts/refresh-data.mjs asks Horizons one
// body at a time (jpl-feeds.mjs) every 6 h and stores the finished body in KV; this
// handler only passes it through (_kvBody.ts). Horizons is never called here: it answers
// 503 to overlapping requests (#88), and every visitor would be one.
//
// A copy is for one UTC date, so for the minutes after 00:00 UTC until the 00:17 run (longer if
// that run is late or fails) it shows yesterday's positions (the Moon moves about 13 degrees a day).

/** KV key written by scripts/refresh-data.mjs. */
export const KV_PLANETS_KEY = 'horizons:planets:v1'
/** The job rewrites it every run; past a day it is for another date, so it is degraded. */
export const FRESH_SECONDS = 24 * 3600

interface Env {
  OBSERVATORY_CACHE: KvStreamReader
}

export function servePlanets(
  ctx: KvCacheContext,
  kv: KvStreamReader,
  now = Date.now(),
): Promise<Response> {
  return serveKvBodyCached(
    ctx,
    kv,
    {
      key: KV_PLANETS_KEY,
      freshSeconds: FRESH_SECONDS,
      notYet: 'Planets not yet in KV: the refresh job writes them',
    },
    now,
  )
}

export const onRequest: PagesFunction<Env> = (ctx) => servePlanets(ctx, ctx.env.OBSERVATORY_CACHE)
