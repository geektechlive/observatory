import type { PagesFunction } from '@cloudflare/workers-types'

import { SAT_GROUPS } from '../../src/lib/orbit/satCatalog'
import { type KvStreamReader, serveKvBody } from './_kvBody'

// The orrery's satellites (#98): one CelesTrak group per request, as compact OMM rows
// the refresh job (celestrak-groups.mjs) stored in KV every 6 h. CelesTrak refuses
// Workers egress, so it is never called here. The bodies run to 1.7 MB (Starlink), so
// they are streamed through unparsed (_kvBody.ts).

/** Elements age in hours; past 36 h the copy is degraded (two missed runs and more). */
export const FRESH_SECONDS = 36 * 3600

const GROUP_IDS: ReadonlySet<string> = new Set(SAT_GROUPS.map((g) => g.id))

interface Env {
  OBSERVATORY_CACHE: KvStreamReader
}

function badRequest(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function serveOrrerySats(
  requestUrl: string,
  kv: KvStreamReader,
  now = Date.now(),
): Promise<Response> {
  const group = new URL(requestUrl).searchParams.get('group') ?? ''
  // An allow-list, not a pattern: the group names a KV key.
  if (!GROUP_IDS.has(group))
    return Promise.resolve(badRequest(`Unknown group; one of: ${[...GROUP_IDS].join(', ')}`))
  return serveKvBody(
    kv,
    {
      key: `celestrak:gp:${group}:v1`,
      freshSeconds: FRESH_SECONDS,
      notYet: `Satellite group ${group} not yet in KV: the refresh job writes it`,
    },
    now,
  )
}

export const onRequest: PagesFunction<Env> = (ctx) =>
  serveOrrerySats(ctx.request.url, ctx.env.OBSERVATORY_CACHE)
