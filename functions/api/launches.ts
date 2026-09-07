import type { PagesFunction } from '@cloudflare/workers-types'

import { LaunchesResponseSchema } from '../../src/schemas/launches'
import { cachedJson, fetchUpstream, upstreamError } from './_cache'

const CACHE_TTL_SECONDS = 1800 // 30 min
const UPSTREAM_TIMEOUT_MS = 10_000
const RLL_URL = 'https://fdo.rocketlaunch.live/json/launches/next/5'
const BACKUP_KEY = 'rll:launches:next:v1:backup'

// The hot 30-min cache lives in the Cache API (free, unmetered) but its entries are
// evictable, so the stale-on-outage backup stays in KV. That backup is now written
// out-of-band by scripts/refresh-data.mjs. This handler only READS it: the previous
// per-miss ctx.waitUntil(...put(...)) burned the free plan's 1,000 writes/day budget.
interface Env {
  OBSERVATORY_CACHE: KVNamespace
}

/**
 * Accept both the new `{ fetchedAt, source, data }` envelope written by the refresh
 * job and the legacy raw RLL payload written by the old handler.
 */
function unwrapEnvelope(parsed: unknown): unknown {
  if (
    typeof parsed === 'object' &&
    parsed !== null &&
    'data' in parsed &&
    'fetchedAt' in parsed &&
    !('result' in parsed)
  ) {
    return (parsed as { data: unknown }).data
  }
  return parsed
}

/**
 * Serve the durable KV backup. Returned as a raw 2xx Response, which cachedJson
 * passes through uncached: stale data must not displace the hot cache entry.
 * Returns null when no usable backup exists.
 */
async function readBackup(kv: KVNamespace | undefined): Promise<Response | null> {
  if (!kv) return null

  let raw: string | null
  try {
    raw = await kv.get(BACKUP_KEY)
  } catch {
    return null
  }
  if (raw === null) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  const validated = LaunchesResponseSchema.safeParse(unwrapEnvelope(parsed))
  if (!validated.success) return null

  return new Response(JSON.stringify(validated.data), {
    headers: {
      'Content-Type': 'application/json',
      'X-Cache': 'STALE',
      'X-Data-Source': 'kv-backup',
      'X-Data-Degraded': '1',
    },
  })
}

export const onRequest: PagesFunction<Env> = (ctx) =>
  cachedJson(ctx, 'rll:launches:next:v1', CACHE_TTL_SECONDS, async () => {
    const kv = ctx.env.OBSERVATORY_CACHE

    let upstream: Response
    try {
      upstream = await fetchUpstream(
        RLL_URL,
        { headers: { Accept: 'application/json' } },
        { timeoutMs: UPSTREAM_TIMEOUT_MS },
      )
    } catch {
      return (await readBackup(kv)) ?? upstreamError(503, 'Launch data upstream unavailable')
    }

    if (!upstream.ok) {
      return (
        (await readBackup(kv)) ??
        upstreamError(upstream.status, `Launch data error: ${upstream.status}`)
      )
    }

    let raw: unknown
    try {
      raw = await upstream.json()
    } catch {
      return (
        (await readBackup(kv)) ?? upstreamError(502, 'Launch data upstream returned invalid JSON')
      )
    }

    const parsed = LaunchesResponseSchema.safeParse(raw)
    if (!parsed.success) {
      return (await readBackup(kv)) ?? upstreamError(502, 'Invalid upstream response')
    }

    return { body: JSON.stringify(parsed.data) }
  })
