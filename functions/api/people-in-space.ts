import type { PagesFunction } from '@cloudflare/workers-types'
import { z } from 'zod'

import { cachedJson, fetchUpstream, upstreamError } from './_cache'

// Community-maintained crew roster (open-notify is dead). Public, no key.
const SOURCE =
  'https://raw.githubusercontent.com/corquaid/international-space-station-APIs/master/JSON/people-in-space.json'
const CACHE_TTL_SECONDS = 6 * 3600 // 6h — source is a hand-updated static file

const RawSchema = z.object({
  number: z.number(),
  iss_expedition: z.union([z.string(), z.number()]).optional(),
  people: z.array(
    z.object({
      name: z.string(),
      spacecraft: z.string().optional(),
      country: z.string().optional(),
      agency: z.string().optional(),
      flag_code: z.string().nullable().optional(),
      launched: z.number().nullable().optional(),
    }),
  ),
})

export const onRequest: PagesFunction = (ctx) =>
  cachedJson(ctx, 'iss:people:v1', CACHE_TTL_SECONDS, async () => {
    const upstream = await fetchUpstream(SOURCE)
    if (!upstream.ok) return upstreamError(upstream.status, 'people-in-space upstream error')

    const parsed = RawSchema.safeParse(await upstream.json())
    if (!parsed.success) {
      console.warn('[people-in-space] invalid upstream response', parsed.error.issues)
      return upstreamError(502, 'Invalid people-in-space response')
    }

    return {
      body: JSON.stringify({
        number: parsed.data.number,
        expedition: parsed.data.iss_expedition != null ? String(parsed.data.iss_expedition) : null,
        people: parsed.data.people.map((p) => ({
          name: p.name,
          craft: p.spacecraft ?? 'Unknown',
          country: p.country ?? '',
          agency: p.agency ?? '',
          flagCode: p.flag_code ?? null,
          launched: p.launched ?? null,
        })),
        updatedAt: new Date().toISOString(),
      }),
    }
  })
