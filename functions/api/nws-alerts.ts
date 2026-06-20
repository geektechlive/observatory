import type { PagesFunction } from '@cloudflare/workers-types'
import { z } from 'zod'
import { cachedJson } from './_cache'

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

function severityColor(sev: string): string {
  switch (sev) {
    case 'Extreme':
      return '#d000ff'
    case 'Severe':
      return '#ff3b30'
    case 'Moderate':
      return '#ff9500'
    case 'Minor':
      return '#ffd60a'
    default:
      return '#8aa0a8'
  }
}

export const onRequest: PagesFunction = (ctx) =>
  cachedJson(ctx, 'nws:alerts:v1', CACHE_TTL_SECONDS, async () => {
    const upstream = await fetch(SOURCE, {
      headers: { 'User-Agent': 'observatory.geektechlive.com', Accept: 'application/geo+json' },
    })
    if (!upstream.ok) {
      return new Response(JSON.stringify({ error: 'Upstream NWS error' }), {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const parsed = RawSchema.safeParse(await upstream.json())
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid upstream response', details: parsed.error.flatten() }),
        { status: 502, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const features = parsed.data.features
      .flatMap((f) => {
        const t = f.geometry?.type
        if (t !== 'Polygon' && t !== 'MultiPolygon') return []
        const sev = f.properties.severity ?? 'Unknown'
        return [
          {
            geometry: f.geometry,
            color: severityColor(sev),
            event: f.properties.event ?? 'Alert',
            severity: sev,
            headline: f.properties.headline ?? '',
          },
        ]
      })
      .slice(0, MAX_FEATURES)

    return { body: JSON.stringify({ features, updatedAt: new Date().toISOString() }) }
  })
