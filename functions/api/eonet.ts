import type { PagesFunction } from '@cloudflare/workers-types'
import { EonetResponseSchema } from '../../src/schemas/eonet'
import { cachedJson } from './_cache'

const EONET_API = 'https://eonet.gsfc.nasa.gov/api/v3/events'
const CACHE_TTL_SECONDS = 300 // 5 min

export const onRequest: PagesFunction = (ctx) =>
  cachedJson(ctx, 'nasa:eonet:open', CACHE_TTL_SECONDS, async () => {
    // EONET is public — no API key required
    const upstream = await fetch(`${EONET_API}?days=14&status=open&limit=200`)
    if (!upstream.ok) {
      return new Response(JSON.stringify({ error: 'Upstream EONET API error' }), {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const raw: unknown = await upstream.json()
    const parsed = EonetResponseSchema.safeParse(raw)
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid upstream response', details: parsed.error.flatten() }),
        { status: 502, headers: { 'Content-Type': 'application/json' } },
      )
    }

    return { body: JSON.stringify(parsed.data) }
  })
