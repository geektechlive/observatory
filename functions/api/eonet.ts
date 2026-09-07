import type { PagesFunction } from '@cloudflare/workers-types'

import { EonetResponseSchema } from '../../src/schemas/eonet'
import { cachedJson, fetchUpstream, upstreamError } from './_cache'

const EONET_API = 'https://eonet.gsfc.nasa.gov/api/v3/events'
const CACHE_TTL_SECONDS = 300 // 5 min

export const onRequest: PagesFunction = (ctx) =>
  cachedJson(ctx, 'nasa:eonet:open', CACHE_TTL_SECONDS, async () => {
    // EONET is public — no API key required
    const upstream = await fetchUpstream(`${EONET_API}?days=14&status=open&limit=200`)
    if (!upstream.ok) return upstreamError(upstream.status, 'EONET upstream error')

    const raw: unknown = await upstream.json()
    const parsed = EonetResponseSchema.safeParse(raw)
    if (!parsed.success) {
      console.warn('[eonet] invalid upstream response', parsed.error.issues)
      return upstreamError(502, 'Invalid EONET response')
    }

    const body = { ...parsed.data, updatedAt: new Date().toISOString() }
    return { body: JSON.stringify(body) }
  })
