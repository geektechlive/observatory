import type { PagesFunction } from '@cloudflare/workers-types'

import { NeoResponseSchema } from '../../src/schemas/neo'
import { cachedJson, fetchUpstream, upstreamError } from './_cache'

const NASA_API_BASE = 'https://api.nasa.gov'
const CACHE_TTL_SECONDS = 900 // 15 min

interface Env {
  NASA_API_KEY: string
}

function dateString(offsetDays: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

export const onRequest: PagesFunction<Env> = (ctx) => {
  const startDate = dateString(0)
  const endDate = dateString(7)
  return cachedJson(ctx, `nasa:neo:${startDate}`, CACHE_TTL_SECONDS, async () => {
    if (!ctx.env.NASA_API_KEY)
      console.warn('[neo] NASA_API_KEY missing — falling back to DEMO_KEY (rate-limited)')
    const apiKey = ctx.env.NASA_API_KEY || 'DEMO_KEY'
    const url = `${NASA_API_BASE}/neo/rest/v1/feed?start_date=${startDate}&end_date=${endDate}&api_key=${apiKey}`
    const upstream = await fetchUpstream(url)

    if (!upstream.ok) return upstreamError(upstream.status, 'NASA NeoWs upstream error')

    const raw: unknown = await upstream.json()
    const parsed = NeoResponseSchema.safeParse(raw)
    if (!parsed.success) {
      console.warn('[neo] invalid upstream response', parsed.error.issues)
      return upstreamError(502, 'Invalid NeoWs response')
    }

    // Note: accurate only on a cache MISS — a HIT serves the header value that
    // was current at write time, not NASA's live remaining count.
    const extraHeaders: Record<string, string> = {}
    const quota = upstream.headers.get('X-RateLimit-Remaining')
    if (quota !== null) extraHeaders['X-Quota-Remaining'] = quota

    const body = { ...parsed.data, updatedAt: new Date().toISOString() }
    return { body: JSON.stringify(body), extraHeaders }
  })
}
