import type { PagesFunction } from '@cloudflare/workers-types'
import { SentryResponseSchema } from '../../src/schemas/sentry'

const SENTRY_API = 'https://ssd-api.jpl.nasa.gov/sentry.api'
const CACHE_TTL_SECONDS = 21600 // 6 h

interface Env {
  OBSERVATORY_CACHE: KVNamespace
}

export const onRequest: PagesFunction<Env> = async ({ env, request }) => {
  const kvKey = 'nasa:sentry:top20'
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

  const upstream = await fetch(`${SENTRY_API}?limit=20`)

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

  const body = JSON.stringify(parsed.data)
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
