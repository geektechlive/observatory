import type { PagesFunction } from '@cloudflare/workers-types'
import { ApodSchema } from '../../src/schemas/apod'
import { cachedJson } from './_cache'

const NASA_API_BASE = 'https://api.nasa.gov'
const CACHE_TTL_SECONDS = 86400 // 24h — APOD changes once per UTC day

interface Env {
  NASA_API_KEY: string
}

function midnightUtcMs(): number {
  const now = new Date()
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
  return Math.floor((midnight.getTime() - now.getTime()) / 1000)
}

export const onRequest: PagesFunction<Env> = (ctx) => {
  const utcDate = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  return cachedJson(ctx, `nasa:apod:${utcDate}`, CACHE_TTL_SECONDS, async () => {
    if (!ctx.env.NASA_API_KEY)
      console.warn('[apod] NASA_API_KEY missing — falling back to DEMO_KEY (rate-limited)')
    const apiKey = ctx.env.NASA_API_KEY ?? 'DEMO_KEY'
    const upstream = await fetch(`${NASA_API_BASE}/planetary/apod?api_key=${apiKey}`)

    if (!upstream.ok) {
      return new Response(JSON.stringify({ error: 'Upstream NASA API error' }), {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const raw: unknown = await upstream.json()
    const parsed = ApodSchema.safeParse(raw)
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid upstream response', details: parsed.error.flatten() }),
        { status: 502, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const extraHeaders: Record<string, string> = {}
    const quota = upstream.headers.get('X-RateLimit-Remaining')
    if (quota !== null) extraHeaders['X-Quota-Remaining'] = quota

    // Cache until next UTC midnight.
    return { body: JSON.stringify(parsed.data), ttl: Math.max(midnightUtcMs(), 60), extraHeaders }
  })
}
