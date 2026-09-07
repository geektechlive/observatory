import type { PagesFunction } from '@cloudflare/workers-types'
import { z } from 'zod'

import { cachedJson, fetchUpstream, upstreamError } from './_cache'

// NASA Exoplanet Archive confirmed-planet count (TAP). Public, no key.
const TAP =
  'https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=select+count(*)+as+total+from+ps+where+default_flag=1&format=json'
const CACHE_TTL_SECONDS = 24 * 3600 // 1 day

const RawSchema = z.array(z.object({ total: z.number() })).min(1)

export const onRequest: PagesFunction = (ctx) =>
  cachedJson(ctx, 'exoplanets:count:v1', CACHE_TTL_SECONDS, async () => {
    const upstream = await fetchUpstream(TAP)
    if (!upstream.ok) return upstreamError(upstream.status, 'Exoplanet Archive upstream error')

    const parsed = RawSchema.safeParse(await upstream.json())
    if (!parsed.success) {
      console.warn('[exoplanets] invalid upstream response', parsed.error.issues)
      return upstreamError(502, 'Invalid Exoplanet Archive response')
    }

    return {
      body: JSON.stringify({
        count: parsed.data[0]?.total ?? 0,
        updatedAt: new Date().toISOString(),
      }),
    }
  })
