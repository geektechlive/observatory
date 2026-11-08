import type { PagesFunction } from '@cloudflare/workers-types'

import { type KvStreamReader, serveKvBody } from './_kvBody'

// Space-Track.org (#101): re-entry predictions, recent decays and the Box Score
// (`part=catalog`, the default), the satellite catalogue in 16 shards by NORAD id
// (`part=satcat&shard=0..15`), and a few famous objects' element history
// (`part=history`). The refresh job (scripts/spacetrack.mjs) reads them with the owner's
// account and stores finished bodies; Space-Track is never called here. Streamed through
// unparsed (_kvBody.ts); a SATCAT shard is about 150 KB.

/** TIP is asked every 6 h, so a catalogue past 36 h means several missed runs. */
export const CATALOG_FRESH_SECONDS = 36 * 3600
/** SATCAT is asked once a day. */
export const SATCAT_FRESH_SECONDS = 72 * 3600
/** The history is the past: each month is asked once ever, and never goes stale. */
export const HISTORY_FRESH_SECONDS = 100 * 365 * 86_400
const SHARDS = 16

interface Env {
  OBSERVATORY_CACHE: KvStreamReader
}

function badRequest(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function serveSpaceTrack(
  requestUrl: string,
  kv: KvStreamReader,
  now = Date.now(),
): Promise<Response> {
  const params = new URL(requestUrl).searchParams
  const part = params.get('part') ?? 'catalog'
  if (part === 'catalog') {
    return serveKvBody(
      kv,
      {
        key: 'spacetrack:catalog:v1',
        freshSeconds: CATALOG_FRESH_SECONDS,
        notYet: 'Space-Track catalogue not yet in KV: the refresh job writes it',
      },
      now,
    )
  }
  if (part === 'history') {
    return serveKvBody(
      kv,
      {
        key: 'spacetrack:history:v1',
        freshSeconds: HISTORY_FRESH_SECONDS,
        notYet: 'Space-Track history not yet in KV: the refresh job writes it',
      },
      now,
    )
  }
  if (part === 'satcat') {
    // An allow-list, not a pattern: the shard names a KV key.
    const raw = params.get('shard') ?? ''
    const shard = /^\d{1,2}$/.test(raw) ? Number(raw) : Number.NaN
    if (!(shard >= 0 && shard < SHARDS)) {
      return Promise.resolve(badRequest(`shard must be 0 to ${String(SHARDS - 1)}`))
    }
    return serveKvBody(
      kv,
      {
        key: `spacetrack:satcat:v1:${String(shard)}`,
        freshSeconds: SATCAT_FRESH_SECONDS,
        notYet: 'Space-Track SATCAT not yet in KV: the refresh job writes it daily',
      },
      now,
    )
  }
  return Promise.resolve(badRequest('Unknown part; one of: catalog, satcat, history'))
}

export const onRequest: PagesFunction<Env> = (ctx) =>
  serveSpaceTrack(ctx.request.url, ctx.env.OBSERVATORY_CACHE)
