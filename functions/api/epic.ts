import type { PagesFunction } from '@cloudflare/workers-types'

import { RawEpicArraySchema } from '../../src/schemas/epic'
import { cachedJson, fetchUpstream, upstreamError } from './_cache'

const EPIC_API_BASE = 'https://epic.gsfc.nasa.gov'
const CACHE_TTL_SECONDS = 3600 // 1 hour — EPIC images update ~daily

export const onRequest: PagesFunction = (ctx) => {
  const today = new Date().toISOString().slice(0, 10)
  return cachedJson(ctx, `nasa:epic:latest:${today}`, CACHE_TTL_SECONDS, async () => {
    const upstream = await fetchUpstream(`${EPIC_API_BASE}/api/natural`)
    if (!upstream.ok) return upstreamError(upstream.status, 'EPIC upstream error')

    const raw: unknown = await upstream.json()
    const parsed = RawEpicArraySchema.safeParse(raw)
    if (!parsed.success || parsed.data.length === 0) {
      if (!parsed.success) console.warn('[epic] invalid upstream response', parsed.error.issues)
      return upstreamError(502, 'Invalid or empty EPIC response')
    }

    const latest = parsed.data[0]
    if (!latest) return upstreamError(502, 'Empty EPIC response')
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
        updatedAt: new Date().toISOString(),
      }),
    }
  })
}
