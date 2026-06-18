import type { PagesFunction } from '@cloudflare/workers-types'
import { z } from 'zod'

// Solar Cycle 25 sunspot trend + 3-day Kp forecast. Public NOAA, no key.
const CYCLE_FEED =
  'https://services.swpc.noaa.gov/json/solar-cycle/observed-solar-cycle-indices.json'
const KP_FORECAST_FEED =
  'https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json'
const CACHE_TTL_SECONDS = 3 * 3600 // 3h — Kp forecast refreshes ~every 3h
const CYCLE_START = '2019-01' // Solar Cycle 25 onset

interface Env {
  OBSERVATORY_CACHE: KVNamespace
}

const CycleRawSchema = z.array(
  z.object({
    'time-tag': z.string(),
    ssn: z.number().nullable(),
    'f10.7': z.number().nullable(),
  }),
)
const KpForecastRawSchema = z.array(
  z.object({
    time_tag: z.string(),
    kp: z.number(),
    observed: z.string(),
    noaa_scale: z.string().nullable(),
  }),
)

async function fetchCycle(): Promise<{
  cycle: { month: string; ssn: number }[]
  latestSsn: number | null
  latestF107: number | null
}> {
  const empty = { cycle: [], latestSsn: null, latestF107: null }
  const res = await fetch(CYCLE_FEED)
  if (!res.ok) return empty
  const parsed = CycleRawSchema.safeParse(await res.json())
  if (!parsed.success) return empty

  const recent = parsed.data.filter((r) => r['time-tag'] >= CYCLE_START)
  const cycle = recent
    .filter((r) => r.ssn !== null)
    .map((r) => ({ month: r['time-tag'], ssn: r.ssn as number }))
  const last = recent[recent.length - 1]
  return {
    cycle,
    latestSsn: last?.ssn ?? null,
    latestF107: last?.['f10.7'] ?? null,
  }
}

async function fetchKpForecast(): Promise<
  { time: string; kp: number; kind: string; scale: string | null }[]
> {
  const res = await fetch(KP_FORECAST_FEED)
  if (!res.ok) return []
  const parsed = KpForecastRawSchema.safeParse(await res.json())
  if (!parsed.success) return []
  // Forward-looking window only (estimated + predicted).
  return parsed.data
    .filter((r) => r.observed !== 'observed')
    .map((r) => ({ time: r.time_tag, kp: r.kp, kind: r.observed, scale: r.noaa_scale }))
}

export const onRequest: PagesFunction<Env> = async ({ env }) => {
  const kvKey = 'noaa:solar-cycle:latest'

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

  const [cycleData, kpForecast] = await Promise.all([fetchCycle(), fetchKpForecast()])

  const body = JSON.stringify({
    cycle: cycleData.cycle,
    latestSsn: cycleData.latestSsn,
    latestF107: cycleData.latestF107,
    kpForecast,
    updatedAt: new Date().toISOString(),
  })
  await env.OBSERVATORY_CACHE.put(kvKey, body, { expirationTtl: CACHE_TTL_SECONDS })

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'X-Cache': 'MISS',
      'X-Cache-TTL': String(CACHE_TTL_SECONDS),
    },
  })
}
