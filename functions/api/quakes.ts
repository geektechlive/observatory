import type { PagesFunction } from '@cloudflare/workers-types'
import { z } from 'zod'

// USGS real-time earthquake feed (M2.5+ over the past 24h). Public, no key.
const USGS_FEED = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson'
const CACHE_TTL_SECONDS = 300 // 5 min — USGS updates every 1-5 min
const MAX_QUAKES = 120

interface Env {
  OBSERVATORY_CACHE: KVNamespace
}

// Lenient parse of the USGS GeoJSON FeatureCollection.
const UsgsRawSchema = z.object({
  features: z.array(
    z.object({
      id: z.string(),
      properties: z.object({
        mag: z.number().nullable(),
        place: z.string().nullable(),
        time: z.number().nullable(),
        tsunami: z.number().nullable().optional(),
        url: z.string().nullable().optional(),
      }),
      geometry: z.object({ coordinates: z.array(z.number()) }).nullable(),
    }),
  ),
})

export const onRequest: PagesFunction<Env> = async ({ env }) => {
  const kvKey = 'usgs:quakes:2.5day'

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

  const upstream = await fetch(USGS_FEED)
  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: 'Upstream USGS feed error' }), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const raw: unknown = await upstream.json()
  const parsed = UsgsRawSchema.safeParse(raw)
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Invalid upstream response', details: parsed.error.flatten() }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const quakes = parsed.data.features
    .flatMap((f) => {
      const coords = f.geometry?.coordinates
      if (!coords || coords.length < 2) return []
      const lon = coords[0]
      const lat = coords[1]
      if (typeof lon !== 'number' || typeof lat !== 'number') return []
      return [
        {
          id: f.id,
          mag: f.properties.mag,
          place: f.properties.place ?? 'Unknown location',
          lat,
          lon,
          depthKm: typeof coords[2] === 'number' ? coords[2] : null,
          time: f.properties.time ?? 0,
          tsunami: f.properties.tsunami === 1,
          url: f.properties.url ?? '',
        },
      ]
    })
    .sort((a, b) => b.time - a.time)
    .slice(0, MAX_QUAKES)

  const body = JSON.stringify({ updatedAt: new Date().toISOString(), quakes })
  await env.OBSERVATORY_CACHE.put(kvKey, body, { expirationTtl: CACHE_TTL_SECONDS })

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'X-Cache': 'MISS',
      'X-Cache-TTL': String(CACHE_TTL_SECONDS),
    },
  })
}
