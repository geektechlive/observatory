import type { PagesFunction } from '@cloudflare/workers-types'
import {
  SolarFlareSchema,
  CmeSchema,
  GeomagneticStormSchema,
  SepSchema,
  type DonkiResponse,
} from '../../src/schemas/donki'
import { z } from 'zod'

const NASA_API_BASE = 'https://api.nasa.gov'
const CACHE_TTL_SECONDS = 900 // 15 min

interface Env {
  OBSERVATORY_CACHE: KVNamespace
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
      .filter((r): r is z.SafeParseSuccess<T> => r.success)
      .map((r) => r.data),
    ok: true,
  }
}

export const onRequest: PagesFunction<Env> = async ({ env, request }) => {
  const endDate = dateString(0)
  const startDate = dateString(-7)
  const kvKey = `nasa:donki:${endDate}`
  const fresh = new URL(request.url).searchParams.get('fresh') === '1'

  if (!fresh) {
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
  }

  const apiKey = env.NASA_API_KEY ?? 'DEMO_KEY'

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
  const body = JSON.stringify(data)
  await env.OBSERVATORY_CACHE.put(kvKey, body, { expirationTtl: CACHE_TTL_SECONDS })

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'X-Cache': 'MISS',
      'X-Cache-TTL': String(CACHE_TTL_SECONDS),
    },
  })
}
