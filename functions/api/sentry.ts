import type { PagesFunction } from '@cloudflare/workers-types'
import { SentryResponseSchema } from '../../src/schemas/sentry'

const SENTRY_API = 'https://ssd-api.jpl.nasa.gov/sentry.api'
const CACHE_TTL_SECONDS = 21600 // 6 h

interface Env {
  OBSERVATORY_CACHE: KVNamespace
}

export const onRequest: PagesFunction<Env> = async ({ env, request }) => {
  const kvKey = 'nasa:sentry:top50'
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

  const upstream = await fetch(SENTRY_API)

  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: 'Upstream JPL Sentry API error' }), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const raw: unknown = await upstream.json()
  const parsed = SentryResponseSchema.safeParse(raw)

  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Invalid upstream response', details: parsed.error.flatten() }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    )
  }

  // Sort by Palermo Scale descending and cap at 50 before caching — full catalog is 2000+ objects
  const top50 = [...parsed.data.data]
    .sort((a, b) => {
      const aPs = parseFloat(a.ps_cum ?? '') || -Infinity
      const bPs = parseFloat(b.ps_cum ?? '') || -Infinity
      return bPs - aPs
    })
    .slice(0, 50)

  const body = JSON.stringify({ count: parsed.data.count, data: top50 })
  await env.OBSERVATORY_CACHE.put(kvKey, body, { expirationTtl: CACHE_TTL_SECONDS })

  const missHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Cache': 'MISS',
    'X-Cache-TTL': String(CACHE_TTL_SECONDS),
  }
  const quota = upstream.headers.get('X-RateLimit-Remaining')
  if (quota !== null) missHeaders['X-Quota-Remaining'] = quota

  return new Response(body, { headers: missHeaders })
}
