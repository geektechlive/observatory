import type { PagesFunction } from '@cloudflare/workers-types'
import { LaunchesResponseSchema } from '../../src/schemas/launches'
import { cachedJson } from './_cache'

const CACHE_TTL_SECONDS = 1800 // 30 min
const BACKUP_TTL_SECONDS = 7 * 24 * 3600 // 7-day stale backup
const RLL_URL = 'https://fdo.rocketlaunch.live/json/launches/next/5'

// Unlike the other endpoints, launches keeps a durable 7-day fallback in KV. The
// Cache API serves the hot 30-min cache (free, unmetered), but its entries are
// evictable at any time, so the stale-on-outage backup must live in KV. KV writes
// here are bounded by misses (~2 keys / 30 min ≈ 96/day max) — negligible.
interface Env {
  OBSERVATORY_CACHE: KVNamespace
}

export const onRequest: PagesFunction<Env> = (ctx) =>
  cachedJson(ctx, 'rll:launches:next:v1', CACHE_TTL_SECONDS, async () => {
    const { env } = ctx
    const backupKey = 'rll:launches:next:v1:backup'

    let upstream: Response
    try {
      upstream = await fetch(RLL_URL, { headers: { Accept: 'application/json' } })
    } catch {
      const stale: string | null = await env.OBSERVATORY_CACHE.get(backupKey)
      if (stale !== null) {
        return new Response(stale, {
          headers: { 'Content-Type': 'application/json', 'X-Cache': 'STALE' },
        })
      }
      return new Response(JSON.stringify({ error: 'Launch data upstream unavailable' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!upstream.ok) {
      const stale: string | null = await env.OBSERVATORY_CACHE.get(backupKey)
      if (stale !== null) {
        return new Response(stale, {
          headers: { 'Content-Type': 'application/json', 'X-Cache': 'STALE' },
        })
      }
      return new Response(JSON.stringify({ error: `Launch data error: ${upstream.status}` }), {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const raw: unknown = await upstream.json()
    const parsed = LaunchesResponseSchema.safeParse(raw)
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid upstream response', details: parsed.error.flatten() }),
        { status: 502, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const body = JSON.stringify(parsed.data)
    // Refresh the durable backup (the hot cache is handled by cachedJson).
    ctx.waitUntil(env.OBSERVATORY_CACHE.put(backupKey, body, { expirationTtl: BACKUP_TTL_SECONDS }))

    return { body }
  })
