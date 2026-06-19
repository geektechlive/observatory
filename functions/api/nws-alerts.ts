import type { PagesFunction } from '@cloudflare/workers-types'
import { z } from 'zod'

// US National Weather Service active alerts (GeoJSON). Public, no key.
const SOURCE = 'https://api.weather.gov/alerts/active'
const CACHE_TTL_SECONDS = 300 // 5 min
const MAX_FEATURES = 200

interface Env {
  OBSERVATORY_CACHE: KVNamespace
}

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

export const onRequest: PagesFunction<Env> = async ({ env }) => {
  const kvKey = 'nws:alerts:v1'

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

  const body = JSON.stringify({ features, updatedAt: new Date().toISOString() })
  await env.OBSERVATORY_CACHE.put(kvKey, body, { expirationTtl: CACHE_TTL_SECONDS })

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'X-Cache': 'MISS',
      'X-Cache-TTL': String(CACHE_TTL_SECONDS),
    },
  })
}
