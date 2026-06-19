import type { PagesFunction } from '@cloudflare/workers-types'

// NASA FIRMS active fire detections (VIIRS, last 24h). Needs a free MAP_KEY,
// kept server-side (env), never shipped to the client. Cached so we hit FIRMS
// at most once per TTL regardless of traffic (well under the 5000/10min limit).
const SOURCE = 'VIIRS_SNPP_NRT'
const CACHE_TTL_SECONDS = 4 * 3600 // 4h — matches satellite overpass cadence
const MAX_FIRES = 500 // top by FRP, to keep the globe/map light

interface Env {
  OBSERVATORY_CACHE: KVNamespace
  FIRMS_MAP_KEY?: string
}

function parseCsv(text: string): {
  fires: {
    lat: number
    lon: number
    frp: number
    confidence: string
    acqDate: string
    daynight: string
  }[]
  total: number
} {
  const lines = text.trim().split('\n')
  const header = lines[0]?.split(',') ?? []
  const idx = (name: string) => header.indexOf(name)
  const iLat = idx('latitude')
  const iLon = idx('longitude')
  const iFrp = idx('frp')
  const iConf = idx('confidence')
  const iDate = idx('acq_date')
  const iDn = idx('daynight')
  if (iLat < 0 || iLon < 0) return { fires: [], total: 0 }

  const all: {
    lat: number
    lon: number
    frp: number
    confidence: string
    acqDate: string
    daynight: string
  }[] = []
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i]?.split(',')
    if (!c) continue
    const lat = parseFloat(c[iLat] ?? '')
    const lon = parseFloat(c[iLon] ?? '')
    if (!isFinite(lat) || !isFinite(lon)) continue
    all.push({
      lat,
      lon,
      frp: parseFloat(c[iFrp] ?? '') || 0,
      confidence: c[iConf] ?? '',
      acqDate: c[iDate] ?? '',
      daynight: c[iDn] ?? '',
    })
  }

  const total = all.length
  const fires = all.sort((a, b) => b.frp - a.frp).slice(0, MAX_FIRES)
  return { fires, total }
}

export const onRequest: PagesFunction<Env> = async ({ env }) => {
  if (!env.FIRMS_MAP_KEY) {
    // Graceful empty payload until the key is configured in Cloudflare.
    return new Response(
      JSON.stringify({ fires: [], total: 0, updatedAt: new Date().toISOString() }),
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Cache': 'MISS',
          'X-Cache-TTL': '0',
          'X-Firms-Key': 'missing',
        },
      },
    )
  }

  const kvKey = 'firms:fires:viirs:v1'

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

  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${env.FIRMS_MAP_KEY}/${SOURCE}/world/1`
  const upstream = await fetch(url)
  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: 'Upstream FIRMS error' }), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { fires, total } = parseCsv(await upstream.text())
  const body = JSON.stringify({ fires, total, updatedAt: new Date().toISOString() })
  await env.OBSERVATORY_CACHE.put(kvKey, body, { expirationTtl: CACHE_TTL_SECONDS })

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'X-Cache': 'MISS',
      'X-Cache-TTL': String(CACHE_TTL_SECONDS),
    },
  })
}
