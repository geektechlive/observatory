import type { PagesFunction } from '@cloudflare/workers-types'

import { type KvStreamReader, serveKvBody } from './_kvBody'

// ESA DISCOSweb (#101): mass, size, shape and operator for the orrery's spacecraft and a
// few dozen satellites, read by the refresh job (scripts/discos.mjs) with the owner's
// token and stored as one finished body. DISCOSweb is never called here.

/** Each object is asked weekly, so a copy is sound for a fortnight. */
export const FRESH_SECONDS = 14 * 86_400

interface Env {
  OBSERVATORY_CACHE: KvStreamReader
}

export function serveDiscos(kv: KvStreamReader, now = Date.now()): Promise<Response> {
  return serveKvBody(
    kv,
    {
      key: 'discos:objects:v1',
      freshSeconds: FRESH_SECONDS,
      notYet: 'DISCOS facts not yet in KV: the refresh job writes them',
    },
    now,
  )
}

export const onRequest: PagesFunction<Env> = (ctx) => serveDiscos(ctx.env.OBSERVATORY_CACHE)
