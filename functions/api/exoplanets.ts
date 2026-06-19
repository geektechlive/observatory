import type { PagesFunction } from '@cloudflare/workers-types'
import { z } from 'zod'

// NASA Exoplanet Archive confirmed-planet count (TAP). Public, no key.
const TAP =
  'https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=select+count(*)+as+total+from+ps+where+default_flag=1&format=json'
const CACHE_TTL_SECONDS = 24 * 3600 // 1 day

interface Env {
  OBSERVATORY_CACHE: KVNamespace
}

const RawSchema = z.array(z.object({ total: z.number() })).min(1)

export const onRequest: PagesFunction<Env> = async ({ env }) => {
  const kvKey = 'exoplanets:count:v1'

  const cached: string | null = await env.OBSERVATORY_CACHE.get(kvKey)
  if (cached !== null) {
    return new Response(cached, {
      headers: {
        'Content-Type': 'application/json',
        'X-Cache': 'HIT',
        'X-Cache-TTL': String(CACHE_TTL_SECONDS),
      },
    })
  }

  const upstream = await fetch(TAP)
  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: 'Upstream Exoplanet Archive error' }), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const parsed = RawSchema.safeParse(await upstream.json())
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Invalid upstream response' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const body = JSON.stringify({ count: parsed.data[0]!.total, updatedAt: new Date().toISOString() })
  await env.OBSERVATORY_CACHE.put(kvKey, body, { expirationTtl: CACHE_TTL_SECONDS })

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'X-Cache': 'MISS',
      'X-Cache-TTL': String(CACHE_TTL_SECONDS),
    },
  })
}
