import type { PagesFunction } from '@cloudflare/workers-types'
import { z } from 'zod'

import { cachedJson, contractError, fetchUpstream, upstreamError } from './_cache'

// US National Weather Service active alerts (GeoJSON). Public, no key.
const SOURCE = 'https://api.weather.gov/alerts/active'
const CACHE_TTL_SECONDS = 300 // 5 min
const MAX_FEATURES = 200

const RawSchema = z.object({
  features: z.array(
    z.object({
      geometry: z.object({ type: z.string(), coordinates: z.unknown() }).nullable(),
      properties: z.object({
        event: z.string().nullish(),
        severity: z.string().nullish(),
        headline: z.string().nullish(),
      }),
    }),
  ),
})

// The client colours alerts from `severity` (src/lib/severity.ts). v2 dropped the old
// server `color` field (#43); the key bump keeps cached v1 bodies from being served.
export const onRequest: PagesFunction = (ctx) =>
  cachedJson(ctx, 'nws:alerts:v2', CACHE_TTL_SECONDS, async () => {
    const upstream = await fetchUpstream(SOURCE, {
      headers: { 'User-Agent': 'observatory.geektechlive.com', Accept: 'application/geo+json' },
    })
    if (!upstream.ok) return upstreamError(upstream.status, 'NWS upstream error')

    const parsed = RawSchema.safeParse(await upstream.json())
    if (!parsed.success) {
      console.warn('[nws-alerts] invalid upstream response', parsed.error.issues)
      return contractError('Invalid NWS response')
    }

    const features = parsed.data.features
      .flatMap((f) => {
        const t = f.geometry?.type
        if (t !== 'Polygon' && t !== 'MultiPolygon') return []
        const sev = f.properties.severity ?? 'Unknown'
        return [
          {
            geometry: f.geometry,
            event: f.properties.event ?? 'Alert',
            severity: sev,
            headline: f.properties.headline ?? '',
          },
        ]
      })
      .slice(0, MAX_FEATURES)

    return { body: JSON.stringify({ features, updatedAt: new Date().toISOString() }) }
  })
