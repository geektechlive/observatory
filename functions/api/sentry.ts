import type { PagesFunction } from '@cloudflare/workers-types'

import { SentryResponseSchema } from '../../src/schemas/sentry'
import { cachedJson, fetchUpstream, upstreamError } from './_cache'

const SENTRY_API = 'https://ssd-api.jpl.nasa.gov/sentry.api'
const CACHE_TTL_SECONDS = 21600 // 6 h

export const onRequest: PagesFunction = (ctx) =>
  cachedJson(ctx, 'nasa:sentry:top50', CACHE_TTL_SECONDS, async () => {
    // JPL Sentry is not gated by the NASA_API_KEY — no quota header to surface here.
    const upstream = await fetchUpstream(SENTRY_API)
    if (!upstream.ok) return upstreamError(upstream.status, 'JPL Sentry upstream error')

    const raw: unknown = await upstream.json()
    const parsed = SentryResponseSchema.safeParse(raw)
    if (!parsed.success) {
      console.warn('[sentry] invalid upstream response', parsed.error.issues)
      return upstreamError(502, 'Invalid Sentry response')
    }

    // Sort by Palermo Scale descending and cap at 50 before caching — full catalog is 2000+ objects
    const top50 = [...parsed.data.data]
      .sort((a, b) => {
        const aPs = parseFloat(a.ps_cum ?? '') || -Infinity
        const bPs = parseFloat(b.ps_cum ?? '') || -Infinity
        return bPs - aPs
      })
      .slice(0, 50)

    return {
      body: JSON.stringify({
        count: parsed.data.count,
        data: top50,
        updatedAt: new Date().toISOString(),
      }),
    }
  })
