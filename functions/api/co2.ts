import type { PagesFunction } from '@cloudflare/workers-types'

// NOAA GML global CO2 trend (Mauna Loa). Public, no key.
// CSV columns: year, month, day, smoothed, trend
const SOURCE = 'https://gml.noaa.gov/webdata/ccgg/trends/co2/co2_trend_gl.csv'
const CACHE_TTL_SECONDS = 24 * 3600 // 1 day

interface Env {
  OBSERVATORY_CACHE: KVNamespace
}

export const onRequest: PagesFunction<Env> = async ({ env }) => {
  const kvKey = 'noaa:co2:trend:v1'

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
    return new Response(JSON.stringify({ error: 'Upstream NOAA CO2 error' }), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const text = await upstream.text()
  const rows = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split(',').map((c) => c.trim()))
    .filter((c) => c.length >= 5 && /^\d{4}$/.test(c[0] ?? ''))

  const last = rows[rows.length - 1]
  if (!last) {
    return new Response(JSON.stringify({ error: 'No CO2 data parsed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const ppm = parseFloat(last[4] ?? '') // trend (deseasonalized)
  const date = `${last[0]}-${String(last[1]).padStart(2, '0')}-${String(last[2]).padStart(2, '0')}`
  const yaRow = rows[rows.length - 366]
  const yearAgo = yaRow ? parseFloat(yaRow[4] ?? '') : NaN

  const result = {
    ppm: isFinite(ppm) ? ppm : 0,
    date,
    yearAgo: isFinite(yearAgo) ? yearAgo : null,
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
