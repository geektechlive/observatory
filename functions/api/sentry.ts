import type { PagesFunction } from '@cloudflare/workers-types'
import { SentryResponseSchema } from '../../src/schemas/sentry'
import { cachedJson } from './_cache'

const SENTRY_API = 'https://ssd-api.jpl.nasa.gov/sentry.api'
const CACHE_TTL_SECONDS = 21600 // 6 h

export const onRequest: PagesFunction = (ctx) =>
  cachedJson(ctx, 'nasa:sentry:top50', CACHE_TTL_SECONDS, async () => {
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

    const extraHeaders: Record<string, string> = {}
    const quota = upstream.headers.get('X-RateLimit-Remaining')
    if (quota !== null) extraHeaders['X-Quota-Remaining'] = quota

    return { body: JSON.stringify({ count: parsed.data.count, data: top50 }), extraHeaders }
  })
