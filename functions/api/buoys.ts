import type { PagesFunction } from '@cloudflare/workers-types'

// NOAA NDBC latest buoy observations (fixed-width text). Public, no key.
// Columns: STN LAT LON YYYY MM DD hh mm WDIR WSPD GST WVHT DPD APD MWD PRES
//          PTDY ATMP WTMP DEWP VIS TIDE  ("MM" = missing)
const SOURCE = 'https://www.ndbc.noaa.gov/data/latest_obs/latest_obs.txt'
const CACHE_TTL_SECONDS = 1800 // 30 min
const MAX_BUOYS = 600

interface Env {
  OBSERVATORY_CACHE: KVNamespace
}

function num(v: string | undefined): number | null {
  if (v === undefined || v === 'MM') return null
  const n = parseFloat(v)
  return isFinite(n) ? n : null
}

export const onRequest: PagesFunction<Env> = async ({ env }) => {
  const kvKey = 'ndbc:buoys:v1'

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
    return new Response(JSON.stringify({ error: 'Upstream NDBC error' }), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const text = await upstream.text()
  const buoys = text
    .split('\n')
    .filter((l) => l && !l.startsWith('#'))
    .flatMap((line) => {
      const c = line.trim().split(/\s+/)
      const lat = num(c[1])
      const lon = num(c[2])
      if (lat === null || lon === null) return []
      return [
        {
          station: c[0] ?? '',
          lat,
          lon,
          windSpeed: num(c[9]),
          waveHeight: num(c[11]),
          waterTemp: num(c[17]),
        },
      ]
    })
    .slice(0, MAX_BUOYS)

  const body = JSON.stringify({ buoys, updatedAt: new Date().toISOString() })
  await env.OBSERVATORY_CACHE.put(kvKey, body, { expirationTtl: CACHE_TTL_SECONDS })

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'X-Cache': 'MISS',
      'X-Cache-TTL': String(CACHE_TTL_SECONDS),
    },
  })
}
