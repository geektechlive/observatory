import type { PagesFunction } from '@cloudflare/workers-types'
import {
  SolarFlareSchema,
  CmeSchema,
  GeomagneticStormSchema,
  SepSchema,
  type DonkiResponse,
} from '../../src/schemas/donki'
import { z } from 'zod'
import { cachedJson } from './_cache'

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
): Promise<{ data: T[]; ok: boolean }> {
  const url = `${NASA_API_BASE}/DONKI/${endpoint}?startDate=${startDate}&endDate=${endDate}&api_key=${apiKey}`
  const res = await fetch(url)
  if (!res.ok) return { data: [], ok: false }
  const raw: unknown = await res.json()
  if (!Array.isArray(raw)) return { data: [], ok: false }
  return {
    data: raw
      .map((item) => schema.safeParse(item))
      .filter((r): r is z.ZodSafeParseSuccess<T> => r.success)
      .map((r) => r.data),
    ok: true,
  }
}

export const onRequest: PagesFunction<Env> = (ctx) => {
  const endDate = dateString(0)
  const startDate = dateString(-7)
  return cachedJson(ctx, `nasa:donki:${endDate}`, CACHE_TTL_SECONDS, async () => {
    if (!ctx.env.NASA_API_KEY)
      console.warn('[donki] NASA_API_KEY missing — falling back to DEMO_KEY (rate-limited)')
    const apiKey = ctx.env.NASA_API_KEY ?? 'DEMO_KEY'

    const [flaresResult, cmesResult, stormsResult, sepsResult] = await Promise.all([
      fetchDonkiEndpoint('FLR', SolarFlareSchema, apiKey, startDate, endDate),
      fetchDonkiEndpoint('CME', CmeSchema, apiKey, startDate, endDate),
      fetchDonkiEndpoint('GST', GeomagneticStormSchema, apiKey, startDate, endDate),
      fetchDonkiEndpoint('SEP', SepSchema, apiKey, startDate, endDate),
    ])

    const allFailed = !flaresResult.ok && !cmesResult.ok && !stormsResult.ok && !sepsResult.ok
    if (allFailed) {
      return new Response(JSON.stringify({ error: 'All DONKI endpoints unavailable' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const data: DonkiResponse = {
      flares: flaresResult.data,
      cmes: cmesResult.data,
      geomagneticStorms: stormsResult.data,
      seps: sepsResult.data,
    }
    return { body: JSON.stringify(data) }
  })
}
