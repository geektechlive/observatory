import type { PagesFunction } from '@cloudflare/workers-types'
import type { z } from 'zod'

import {
  CmeSchema,
  type DonkiResponse,
  GeomagneticStormSchema,
  SepSchema,
  SolarFlareSchema,
} from '../../src/schemas/donki'
import { cachedJson, fetchUpstream, upstreamError } from './_cache'

const NASA_API_BASE = 'https://api.nasa.gov'
const CACHE_TTL_SECONDS = 900 // 15 min

interface Env {
  NASA_API_KEY: string
}

function dateString(offsetDays: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + offsetDays)
  return d.toISOString().slice(0, 10)
}

async function fetchDonkiEndpoint<T>(
  endpoint: string,
  schema: z.ZodType<T>,
  apiKey: string,
  startDate: string,
  endDate: string,
): Promise<{ data: T[]; ok: boolean; quota: string | null }> {
  const url = `${NASA_API_BASE}/DONKI/${endpoint}?startDate=${startDate}&endDate=${endDate}&api_key=${apiKey}`
  const res = await fetchUpstream(url)
  if (!res.ok) return { data: [], ok: false, quota: null }
  const raw: unknown = await res.json()
  if (!Array.isArray(raw))
    return { data: [], ok: false, quota: res.headers.get('X-RateLimit-Remaining') }
  return {
    data: raw
      .map((item) => schema.safeParse(item))
      .filter((r): r is z.ZodSafeParseSuccess<T> => r.success)
      .map((r) => r.data),
    ok: true,
    quota: res.headers.get('X-RateLimit-Remaining'),
  }
}

export const onRequest: PagesFunction<Env> = (ctx) => {
  const endDate = dateString(0)
  const startDate = dateString(-7)
  return cachedJson(ctx, `nasa:donki:${endDate}`, CACHE_TTL_SECONDS, async () => {
    if (!ctx.env.NASA_API_KEY)
      console.warn('[donki] NASA_API_KEY missing — falling back to DEMO_KEY (rate-limited)')
    const apiKey = ctx.env.NASA_API_KEY || 'DEMO_KEY'

    const [flaresResult, cmesResult, stormsResult, sepsResult] = await Promise.all([
      fetchDonkiEndpoint('FLR', SolarFlareSchema, apiKey, startDate, endDate),
      fetchDonkiEndpoint('CME', CmeSchema, apiKey, startDate, endDate),
      fetchDonkiEndpoint('GST', GeomagneticStormSchema, apiKey, startDate, endDate),
      fetchDonkiEndpoint('SEP', SepSchema, apiKey, startDate, endDate),
    ])

    const allFailed = !flaresResult.ok && !cmesResult.ok && !stormsResult.ok && !sepsResult.ok
    if (allFailed) return upstreamError(502, 'All DONKI endpoints unavailable')

    const data: DonkiResponse = {
      flares: flaresResult.data,
      cmes: cmesResult.data,
      geomagneticStorms: stormsResult.data,
      seps: sepsResult.data,
    }

    // Note: accurate only on a cache MISS — a HIT serves the header value that
    // was current at write time, not NASA's live remaining count.
    const extraHeaders: Record<string, string> = {}
    const quota = flaresResult.quota ?? cmesResult.quota ?? stormsResult.quota ?? sepsResult.quota
    if (quota !== null) extraHeaders['X-Quota-Remaining'] = quota

    return { body: JSON.stringify(data), extraHeaders }
  })
}
