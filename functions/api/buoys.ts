import type { PagesFunction } from '@cloudflare/workers-types'
import { cachedJson } from './_cache'

// NOAA NDBC latest buoy observations (fixed-width text). Public, no key.
// Columns: STN LAT LON YYYY MM DD hh mm WDIR WSPD GST WVHT DPD APD MWD PRES
//          PTDY ATMP WTMP DEWP VIS TIDE  ("MM" = missing)
const SOURCE = 'https://www.ndbc.noaa.gov/data/latest_obs/latest_obs.txt'
const CACHE_TTL_SECONDS = 1800 // 30 min
const MAX_BUOYS = 600

function num(v: string | undefined): number | null {
  if (v === undefined || v === 'MM') return null
  const n = parseFloat(v)
  return isFinite(n) ? n : null
}

export const onRequest: PagesFunction = (ctx) =>
  cachedJson(ctx, 'ndbc:buoys:v1', CACHE_TTL_SECONDS, async () => {
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

    return { body: JSON.stringify({ buoys, updatedAt: new Date().toISOString() }) }
  })
