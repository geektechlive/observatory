import type { PagesFunction } from '@cloudflare/workers-types'
import { RawEpicArraySchema } from '../../src/schemas/epic'
import { cachedJson } from './_cache'

const EPIC_API_BASE = 'https://epic.gsfc.nasa.gov'
const CACHE_TTL_SECONDS = 3600 // 1 hour — EPIC images update ~daily

export const onRequest: PagesFunction = (ctx) => {
  const today = new Date().toISOString().slice(0, 10)
  return cachedJson(ctx, `nasa:epic:latest:${today}`, CACHE_TTL_SECONDS, async () => {
    const upstream = await fetch(`${EPIC_API_BASE}/api/natural`)
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
    if (!latest) {
      return new Response(JSON.stringify({ error: 'Empty EPIC response' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    // date format: "2025-04-28 00:30:49"
    const [datePart] = latest.date.split(' ')
    const [year, month, day] = (datePart ?? '').split('-')

    return {
      body: JSON.stringify({
        image: latest.image,
        date: latest.date,
        caption: latest.caption,
        centroidLat: latest.centroid_coordinates.lat,
        centroidLon: latest.centroid_coordinates.lon,
        year: year ?? '',
        month: month ?? '',
        day: day ?? '',
      }),
    }
  })
}
