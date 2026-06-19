import type { PagesFunction } from '@cloudflare/workers-types'
import { z } from 'zod'

// Curiosity REMS weather (latest sol). Public, no key.
const SOURCE = 'https://mars.nasa.gov/rss/api/?feed=weather&category=msl&feedtype=json'
const CACHE_TTL_SECONDS = 6 * 3600 // 6h — updates per rover downlink (~daily)

interface Env {
  OBSERVATORY_CACHE: KVNamespace
}

const RawSchema = z.object({
  soles: z
    .array(
      z.object({
        sol: z.string(),
        terrestrial_date: z.string().optional(),
        min_temp: z.string().optional(),
        max_temp: z.string().optional(),
        pressure: z.string().optional(),
        atmo_opacity: z.string().optional(),
        season: z.string().optional(),
        sunrise: z.string().optional(),
        sunset: z.string().optional(),
        local_uv_irradiance_index: z.string().optional(),
      }),
    )
    .min(1),
})

function num(v: string | undefined): number | null {
  if (v === undefined || v === '' || v === '--') return null
  const n = parseFloat(v)
  return isFinite(n) ? n : null
}

export const onRequest: PagesFunction<Env> = async ({ env }) => {
  const kvKey = 'mars:weather:latest'

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
    return new Response(JSON.stringify({ error: 'Upstream Mars weather error' }), {
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

  const s = parsed.data.soles[0]!
  const result = {
    sol: parseInt(s.sol, 10) || 0,
    terrestrialDate: s.terrestrial_date ?? '',
    minTemp: num(s.min_temp),
    maxTemp: num(s.max_temp),
    pressure: num(s.pressure),
    opacity: s.atmo_opacity ?? null,
    season: s.season ?? null,
    sunrise: s.sunrise ?? null,
    sunset: s.sunset ?? null,
    uv: s.local_uv_irradiance_index ?? null,
    updatedAt: new Date().toISOString(),
  }

  const body = JSON.stringify(result)
  await env.OBSERVATORY_CACHE.put(kvKey, body, { expirationTtl: CACHE_TTL_SECONDS })

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'X-Cache': 'MISS',
      'X-Cache-TTL': String(CACHE_TTL_SECONDS),
    },
  })
}
