import type { PagesFunction } from '@cloudflare/workers-types'
import { z } from 'zod'

import { cachedJson, fetchUpstream, upstreamError } from './_cache'

// OpenAQ v3 latest PM2.5 across stations (one call). Needs a free API key, kept
// server-side. Cached so we hit OpenAQ at most once per TTL (well under 60/min).
const OPENAQ_URL = 'https://api.openaq.org/v3/parameters/2/latest?limit=1000'
const CACHE_TTL_SECONDS = 900 // 15 min
const MAX_STATIONS = 800

interface Env {
  OPENAQ_API_KEY?: string
}

const OpenAqRawSchema = z.object({
  results: z.array(
    z.object({
      value: z.number().nullable(),
      coordinates: z
        .object({ latitude: z.number().nullable(), longitude: z.number().nullable() })
        .nullable(),
    }),
  ),
})

export const onRequest: PagesFunction<Env> = (ctx) => {
  const apiKey = ctx.env.OPENAQ_API_KEY
  if (!apiKey) {
    // No key configured yet — degrade gracefully instead of erroring.
    return Promise.resolve(
      new Response(JSON.stringify({ stations: [], updatedAt: new Date().toISOString() }), {
        headers: {
          'Content-Type': 'application/json',
          'X-Cache': 'MISS',
          'X-Cache-TTL': '0',
          'X-Data-Degraded': '1',
        },
      }),
    )
  }

  return cachedJson(ctx, 'openaq:pm25:latest:v1', CACHE_TTL_SECONDS, async () => {
    const upstream = await fetchUpstream(OPENAQ_URL, { headers: { 'X-API-Key': apiKey } })
    if (!upstream.ok) return upstreamError(upstream.status, 'OpenAQ upstream error')

    const parsed = OpenAqRawSchema.safeParse(await upstream.json())
    if (!parsed.success) {
      console.warn('[air-quality] invalid upstream response', parsed.error.issues)
      return upstreamError(502, 'Invalid OpenAQ response')
    }

    const stations = parsed.data.results
      .flatMap((r) => {
        const lat = r.coordinates?.latitude
        const lon = r.coordinates?.longitude
        if (typeof lat !== 'number' || typeof lon !== 'number') return []
        if (r.value === null || r.value < 0) return [] // drop invalid / sentinel readings
        return [{ lat, lon, pm25: r.value }]
      })
      .slice(0, MAX_STATIONS)

    return { body: JSON.stringify({ stations, updatedAt: new Date().toISOString() }) }
  })
}
