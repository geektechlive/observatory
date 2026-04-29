import type { PagesFunction } from '@cloudflare/workers-types'
import { EonetResponseSchema } from '../../src/schemas/eonet'

const EONET_API = 'https://eonet.gsfc.nasa.gov/api/v3/events'
const CACHE_TTL_SECONDS = 300 // 5 min

interface Env {
  OBSERVATORY_CACHE: KVNamespace
}

export const onRequest: PagesFunction<Env> = async ({ env, request }) => {
  const kvKey = 'nasa:eonet:open'
  const fresh = new URL(request.url).searchParams.get('fresh') === '1'

  if (!fresh) {
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
  }

  // EONET is public — no API key required
  const upstream = await fetch(`${EONET_API}?days=14&status=open&limit=200`)

  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: 'Upstream EONET API error' }), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const raw: unknown = await upstream.json()

  const parsed = EonetResponseSchema.safeParse(raw)
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Invalid upstream response', details: parsed.error.flatten() }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }

  const body = JSON.stringify(parsed.data)
  await env.OBSERVATORY_CACHE.put(kvKey, body, { expirationTtl: CACHE_TTL_SECONDS })

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'X-Cache': 'MISS',
      'X-Cache-TTL': String(CACHE_TTL_SECONDS),
    },
  })
}
