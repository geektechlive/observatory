import type { PagesFunction } from '@cloudflare/workers-types'
import { z } from 'zod'

import { cachedJson, fetchUpstream, upstreamError } from './_cache'

// NOAA OVATION aurora forecast (global 1° grid). Public, no key.
const SOURCE = 'https://services.swpc.noaa.gov/json/ovation_aurora_latest.json'
const CACHE_TTL_SECONDS = 600 // 10 min — OVATION updates ~every 30 min
const MIN_INTENSITY = 4 // drop near-zero grid cells
const MAX_POINTS = 3500 // keep the canvas overlay light

const RawSchema = z.object({
  'Observation Time': z.string().optional(),
  'Forecast Time': z.string().optional(),
  coordinates: z.array(z.tuple([z.number(), z.number(), z.number()])),
})

export const onRequest: PagesFunction = (ctx) =>
  cachedJson(ctx, 'noaa:aurora:ovation:v1', CACHE_TTL_SECONDS, async () => {
    const upstream = await fetchUpstream(SOURCE)
    if (!upstream.ok) return upstreamError(upstream.status, 'OVATION upstream error')

    const parsed = RawSchema.safeParse(await upstream.json())
    if (!parsed.success) {
      console.warn('[aurora] invalid upstream response', parsed.error.issues)
      return upstreamError(502, 'Invalid OVATION response')
    }

    // Keep the strongest oval cells; normalize lon to [-180,180].
    const points = parsed.data.coordinates
      .filter((p) => p[2] >= MIN_INTENSITY)
      .sort((a, b) => b[2] - a[2])
      .slice(0, MAX_POINTS)
      .map(([lon, lat, i]) => [lon > 180 ? lon - 360 : lon, lat, i] as [number, number, number])

    return {
      body: JSON.stringify({
        points,
        observationTime: parsed.data['Observation Time'] ?? '',
        forecastTime: parsed.data['Forecast Time'] ?? '',
        updatedAt: new Date().toISOString(),
      }),
    }
  })
