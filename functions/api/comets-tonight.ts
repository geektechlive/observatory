import type { PagesFunction } from '@cloudflare/workers-types'

import { type KvStreamReader, serveKvBody } from './_kvBody'

// The Tonight panel's comets (#135): a week of each comet's spans, cut by
// scripts/refresh-data.mjs (comets-tonight.mjs) from the comet payload it writes to
// horizons:smallbodies:v1, and stored in KV as the finished response body. Streamed
// through unparsed (_kvBody.ts), like /api/orrery-smallbodies.

/** KV key written by scripts/refresh-data.mjs. */
export const KV_COMETS_TONIGHT_KEY = 'horizons:comets-tonight:v1'
/** Written with the comet payload, so it is fresh for as long: 72 h. */
export const FRESH_SECONDS = 72 * 3600

interface Env {
  OBSERVATORY_CACHE: KvStreamReader
}

export function serveCometsTonight(kv: KvStreamReader, now = Date.now()): Promise<Response> {
  return serveKvBody(
    kv,
    {
      key: KV_COMETS_TONIGHT_KEY,
      freshSeconds: FRESH_SECONDS,
      notYet: "Tonight's comets not yet in KV: the refresh job writes them",
    },
    now,
  )
}

export const onRequest: PagesFunction<Env> = (ctx) => serveCometsTonight(ctx.env.OBSERVATORY_CACHE)
