import type { PagesFunction } from '@cloudflare/workers-types'
import { NeoResponseSchema } from '../../src/schemas/neo'

const NASA_API_BASE = 'https://api.nasa.gov'
const CACHE_TTL_SECONDS = 900 // 15 min

interface Env {
  OBSERVATORY_CACHE: KVNamespace
  NASA_API_KEY: string
}

function dateString(offsetDays: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

export const onRequest: PagesFunction<Env> = async ({ env, request }) => {
  const startDate = dateString(0)
  const endDate = dateString(7)
  const kvKey = `nasa:neo:${startDate}`
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

  const apiKey = env.NASA_API_KEY ?? 'DEMO_KEY'
  const url = `${NASA_API_BASE}/neo/rest/v1/feed?start_date=${startDate}&end_date=${endDate}&api_key=${apiKey}`
  const upstream = await fetch(url)

  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: 'Upstream NASA NeoWs API error' }), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const raw: unknown = await upstream.json()
  const parsed = NeoResponseSchema.safeParse(raw)

  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Invalid upstream response', details: parsed.error.flatten() }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
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
