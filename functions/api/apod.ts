import type { PagesFunction } from '@cloudflare/workers-types'
import { ApodSchema } from '../../src/schemas/apod'

const NASA_API_BASE = 'https://api.nasa.gov'
const CACHE_TTL_SECONDS = 86400 // 24h — APOD changes once per UTC day

interface Env {
  OBSERVATORY_CACHE: KVNamespace
  NASA_API_KEY: string
}

function midnightUtcMs(): number {
  const now = new Date()
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
  return Math.floor((midnight.getTime() - now.getTime()) / 1000)
}

export const onRequest: PagesFunction<Env> = async ({ env, request }) => {
  const utcDate = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  const kvKey = `nasa:apod:${utcDate}`
  const fresh = new URL(request.url).searchParams.get('fresh') === '1'

  // Serve from cache unless ?fresh=1
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

  // Fetch from NASA
  const apiKey = env.NASA_API_KEY ?? 'DEMO_KEY'
  const upstream = await fetch(`${NASA_API_BASE}/planetary/apod?api_key=${apiKey}`)

  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: 'Upstream NASA API error' }), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const raw: unknown = await upstream.json()

  // Validate with Zod before caching
  const parsed = ApodSchema.safeParse(raw)
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

  // Cache until next UTC midnight
  const ttl = midnightUtcMs()
  await env.OBSERVATORY_CACHE.put(kvKey, body, { expirationTtl: Math.max(ttl, 60) })

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'X-Cache': 'MISS',
      'X-Cache-TTL': String(ttl),
    },
  })
}
