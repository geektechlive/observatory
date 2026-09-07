import type { PagesFunction } from '@cloudflare/workers-types'

import { ApodSchema } from '../../src/schemas/apod'
import { cachedJson, fetchUpstream, upstreamError } from './_cache'

const NASA_API_BASE = 'https://api.nasa.gov'
const CACHE_TTL_SECONDS = 86400 // 24h — APOD changes once per UTC day

// Only these hosts are allowed through for url/hdurl — anything else is nulled
// server-side before the client ever sees it.
const ALLOWED_MEDIA_HOSTS = [
  'https://apod.nasa.gov/',
  'https://www.youtube.com/',
  'https://youtube.com/',
  'https://player.vimeo.com/',
]

interface Env {
  NASA_API_KEY: string
}

function midnightUtcMs(): number {
  const now = new Date()
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))
  return Math.floor((midnight.getTime() - now.getTime()) / 1000)
}

function allowedOrNull(url: string | undefined): string | undefined {
  if (url === undefined) return undefined
  return ALLOWED_MEDIA_HOSTS.some((host) => url.startsWith(host)) ? url : undefined
}

export const onRequest: PagesFunction<Env> = (ctx) => {
  const utcDate = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
  return cachedJson(ctx, `nasa:apod:${utcDate}`, CACHE_TTL_SECONDS, async () => {
    if (!ctx.env.NASA_API_KEY)
      console.warn('[apod] NASA_API_KEY missing — falling back to DEMO_KEY (rate-limited)')
    const apiKey = ctx.env.NASA_API_KEY || 'DEMO_KEY'
    const upstream = await fetchUpstream(`${NASA_API_BASE}/planetary/apod?api_key=${apiKey}`)

    if (!upstream.ok) return upstreamError(upstream.status, 'NASA APOD upstream error')

    const raw: unknown = await upstream.json()
    const parsed = ApodSchema.safeParse(raw)
    if (!parsed.success) {
      console.warn('[apod] invalid upstream response', parsed.error.issues)
      return upstreamError(502, 'Invalid APOD response')
    }

    // Note: accurate only on a cache MISS — a HIT serves the header value that
    // was current at write time, not NASA's live remaining count.
    const extraHeaders: Record<string, string> = {}
    const quota = upstream.headers.get('X-RateLimit-Remaining')
    if (quota !== null) extraHeaders['X-Quota-Remaining'] = quota

    const body = {
      ...parsed.data,
      url: allowedOrNull(parsed.data.url) ?? null,
      hdurl: allowedOrNull(parsed.data.hdurl) ?? null,
      updatedAt: new Date().toISOString(),
    }

    // Cache until next UTC midnight.
    return { body: JSON.stringify(body), ttl: Math.max(midnightUtcMs(), 60), extraHeaders }
  })
}
