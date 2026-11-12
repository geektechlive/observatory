import type { PagesFunction } from '@cloudflare/workers-types'

import { SentryResponseSchema } from '../../src/schemas/sentry'
import { cachedJson, contractError, upstreamError } from './_cache'
import { askJplFeed, type JplEnv } from './_jpl'

const SENTRY_API = 'https://ssd-api.jpl.nasa.gov/sentry.api'
const CACHE_TTL_SECONDS = 21600 // 6 h

export const onRequest: PagesFunction<JplEnv> = (ctx) =>
  cachedJson(ctx, 'nasa:sentry:top50', CACHE_TTL_SECONDS, async () => {
    // JPL Sentry is not gated by the NASA_API_KEY — no quota header to surface here.
    // Only a cache miss reaches JPL, through the jpl-queue when it is bound (#146).
    const reply = await askJplFeed(ctx.env.JPL_QUEUE, SENTRY_API)
    if (!reply.ok) return reply.response
    if (reply.status !== 200) return upstreamError(reply.status, 'JPL Sentry upstream error')

    const raw: unknown = JSON.parse(reply.text)
    const parsed = SentryResponseSchema.safeParse(raw)
    if (!parsed.success) {
      console.warn('[sentry] invalid upstream response', parsed.error.issues)
      return contractError('Invalid Sentry response')
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
