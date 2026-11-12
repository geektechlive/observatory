import type { PagesFunction } from '@cloudflare/workers-types'

import { type KvStreamReader, serveKvBody } from './_kvBody'

// The orrery's dwarf planets (#99 item 8): Pluto, Ceres, Eris, Makemake and Haumea, one
// JPL Horizons span each, and Pluto's moon Charon, built by scripts/refresh-data.mjs (orrery-dwarfs.mjs) and stored
// in KV as the finished response body. A key and URL of their own, so only a visitor who
// switches them on downloads them, never the Tonight panel's comets. Streamed through
// unparsed (_kvBody.ts); JPL is never called here (#88).

/** KV key written by scripts/refresh-data.mjs. */
export const KV_ORRERY_DWARFS_KEY = 'horizons:dwarfs:v1'
/** The job rewrites it every run, so a copy older than 72 h means its refreshes failed. */
export const FRESH_SECONDS = 72 * 3600

interface Env {
  OBSERVATORY_CACHE: KvStreamReader
}

export function serveOrreryDwarfs(kv: KvStreamReader, now = Date.now()): Promise<Response> {
  return serveKvBody(
    kv,
    {
      key: KV_ORRERY_DWARFS_KEY,
      freshSeconds: FRESH_SECONDS,
      notYet: 'Dwarf planets not yet in KV: the refresh job writes them',
    },
    now,
  )
}

export const onRequest: PagesFunction<Env> = (ctx) => serveOrreryDwarfs(ctx.env.OBSERVATORY_CACHE)
