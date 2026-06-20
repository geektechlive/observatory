import type { PagesFunction } from '@cloudflare/workers-types'
import { z } from 'zod'
import { cachedJson } from './_cache'

// GDACS global disaster alerts (Orange/Red = active). Public, no key.
const GDACS_API =
  'https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=EQ,TC,FL,VO,WF,DR&alertlevel=Orange,Red&limit=100&format=geojson'
const CACHE_TTL_SECONDS = 900 // 15 min
const MAX_EVENTS = 60

const GdacsRawSchema = z.object({
  features: z.array(
    z.object({
      properties: z.object({
        eventid: z.union([z.string(), z.number()]).optional(),
        eventtype: z.string().optional(),
        name: z.string().optional(),
        alertlevel: z.string().optional(),
        country: z.string().optional(),
        fromdate: z.string().optional(),
      }),
      geometry: z.object({ coordinates: z.array(z.number()) }).nullable(),
    }),
  ),
})

export const onRequest: PagesFunction = (ctx) =>
  cachedJson(ctx, 'gdacs:active:v1', CACHE_TTL_SECONDS, async () => {
    const upstream = await fetch(GDACS_API)
    if (!upstream.ok) {
      return new Response(JSON.stringify({ error: 'Upstream GDACS error' }), {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const parsed = GdacsRawSchema.safeParse(await upstream.json())
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid upstream response', details: parsed.error.flatten() }),
        { status: 502, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const events = parsed.data.features
      .flatMap((f, i) => {
        const coords = f.geometry?.coordinates
        if (!coords || coords.length < 2) return []
        const lon = coords[0]
        const lat = coords[1]
        if (typeof lon !== 'number' || typeof lat !== 'number') return []
        const p = f.properties
        return [
          {
            id: p.eventid != null ? String(p.eventid) : `gdacs-${i}`,
            type: p.eventtype ?? '?',
            name: p.name ?? 'Disaster alert',
            alert: p.alertlevel ?? 'Orange',
            lat,
            lon,
            country: p.country ?? '',
            from: p.fromdate ?? '',
          },
        ]
      })
      .slice(0, MAX_EVENTS)

    return { body: JSON.stringify({ events, updatedAt: new Date().toISOString() }) }
  })
