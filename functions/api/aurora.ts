import type { PagesFunction } from '@cloudflare/workers-types'
import { z } from 'zod'

// NOAA OVATION aurora forecast (global 1° grid). Public, no key.
const SOURCE = 'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json'
const CACHE_TTL_SECONDS = 600 // 10 min — OVATION updates ~every 30 min
const MIN_INTENSITY = 4 // drop near-zero grid cells
const MAX_POINTS = 3500 // keep the canvas overlay light

interface Env {
  OBSERVATORY_CACHE: KVNamespace
}

const RawSchema = z.object({
  'Observation Time': z.string().optional(),
  'Forecast Time': z.string().optional(),
  coordinates: z.array(z.tuple([z.number(), z.number(), z.number()])),
})

export const onRequest: PagesFunction<Env> = async ({ env }) => {
  const kvKey = 'noaa:aurora:ovation:v1'

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

  const upstream = await fetch(SOURCE)
  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: 'Upstream OVATION error' }), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const parsed = RawSchema.safeParse(await upstream.json())
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Invalid upstream response' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Keep the strongest oval cells; normalize lon to [-180,180].
  const points = parsed.data.coordinates
    .filter((p) => p[2] >= MIN_INTENSITY)
    .sort((a, b) => b[2] - a[2])
    .slice(0, MAX_POINTS)
    .map(([lon, lat, i]) => [lon > 180 ? lon - 360 : lon, lat, i] as [number, number, number])

  const body = JSON.stringify({
    points,
    observationTime: parsed.data['Observation Time'] ?? '',
    forecastTime: parsed.data['Forecast Time'] ?? '',
    updatedAt: new Date().toISOString(),
  })
  await env.OBSERVATORY_CACHE.put(kvKey, body, { expirationTtl: CACHE_TTL_SECONDS })

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'X-Cache': 'MISS',
      'X-Cache-TTL': String(CACHE_TTL_SECONDS),
    },
  })
}
