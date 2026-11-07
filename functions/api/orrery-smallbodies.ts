import type { PagesFunction } from '@cloudflare/workers-types'

import { type KvStreamReader, serveKvBody } from './_kvBody'

// The orrery's comets and interstellar objects (#99): the comets JPL forecasts brightest
// tonight and 1I, 2I and 3I, each with JPL Horizons vectors, built by
// scripts/refresh-data.mjs (orrery-smallbodies.mjs) every 6 h and stored in KV as the
// finished response body. Streamed through unparsed (_kvBody.ts); JPL is never called
// here, because it refuses overlapping requests (#88) and every visitor would be one.

/** KV key written by scripts/refresh-data.mjs. */
export const KV_ORRERY_SMALLBODIES_KEY = 'horizons:smallbodies:v1'
/** Spans run 30 days either side of the refresh, so a copy is fresh for 72 h. */
export const FRESH_SECONDS = 72 * 3600

interface Env {
  OBSERVATORY_CACHE: KvStreamReader
}

export function serveOrrerySmallBodies(kv: KvStreamReader, now = Date.now()): Promise<Response> {
  return serveKvBody(
    kv,
    {
      key: KV_ORRERY_SMALLBODIES_KEY,
      freshSeconds: FRESH_SECONDS,
      notYet: 'Comets and interstellar objects not yet in KV: the refresh job writes them',
    },
    now,
  )
}

export const onRequest: PagesFunction<Env> = (ctx) =>
  serveOrrerySmallBodies(ctx.env.OBSERVATORY_CACHE)
