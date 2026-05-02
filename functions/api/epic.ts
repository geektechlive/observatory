import type { PagesFunction } from '@cloudflare/workers-types'
import { RawEpicArraySchema } from '../../src/schemas/epic'

const EPIC_API_BASE = 'https://epic.gsfc.nasa.gov'
const CACHE_TTL_SECONDS = 3600 // 1 hour — EPIC images update ~daily

interface Env {
  OBSERVATORY_CACHE: KVNamespace
}

export const onRequest: PagesFunction<Env> = async ({ env }) => {
  const today = new Date().toISOString().slice(0, 10)
  const kvKey = `nasa:epic:latest:${today}`

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

  const url = `${EPIC_API_BASE}/api/natural`
  const upstream = await fetch(url)

  if (!upstream.ok) {
    return new Response(JSON.stringify({ error: 'Upstream EPIC API error' }), {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const raw: unknown = await upstream.json()
  const parsed = RawEpicArraySchema.safeParse(raw)

  if (!parsed.success || parsed.data.length === 0) {
    return new Response(
      JSON.stringify({
        error: 'Invalid or empty EPIC response',
        details: parsed.success ? 'empty' : parsed.error.flatten(),
      }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const latest = parsed.data[0]
  // date format: "2025-04-28 00:30:49"
  const [datePart] = latest.date.split(' ')
  const [year, month, day] = (datePart ?? '').split('-')

  const result = {
    image: latest.image,
    date: latest.date,
    caption: latest.caption,
    centroidLat: latest.centroid_coordinates.lat,
    centroidLon: latest.centroid_coordinates.lon,
    year: year ?? '',
    month: month ?? '',
    day: day ?? '',
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
