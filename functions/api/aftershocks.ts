import type { PagesFunction } from '@cloudflare/workers-types'
import { z } from 'zod'

import type { AftershockForecast } from '../../src/schemas/aftershocks'
import { cachedJson, contractError, fetchUpstream, upstreamError } from './_cache'

// USGS aftershock forecasts (#76). For significant quakes USGS publishes an `oaf`
// product: the probability of at least one aftershock at or above each magnitude over
// the next day, week, month and year (ETAS model). We show the strongest quakes of the
// last 30 days that have one. Each needs two more requests (event detail, then its
// forecast.json), so the list is capped at three.
const SEARCH = 'https://earthquake.usgs.gov/fdsnws/event/1/query'
const MAX_QUAKES = 3
const LOOKBACK_DAYS = 30
const CACHE_TTL_SECONDS = 1800

const SearchSchema = z.object({
  features: z.array(
    z.object({
      id: z.string(),
      properties: z.object({
        mag: z.number(),
        place: z.string().nullable(),
        time: z.number(),
        url: z.string(),
        detail: z.string(),
      }),
    }),
  ),
})

const DetailSchema = z.object({
  properties: z.object({
    products: z.object({
      oaf: z
        .array(z.object({ contents: z.object({ 'forecast.json': z.object({ url: z.string() }) }) }))
        .min(1),
    }),
  }),
})

const ForecastSchema = z.object({
  forecast: z.array(
    z.object({
      label: z.string(),
      bins: z.array(z.object({ magnitude: z.number(), probability: z.number() })),
    }),
  ),
})

type Quake = z.infer<typeof SearchSchema>['features'][number]
type Outcome = { forecast: AftershockForecast } | { failed: 'upstream' | 'contract' }

/** The M5+ and M6+ odds in one window ('1 Day', '1 Week'), or null if a bin is missing. */
function window(
  forecast: z.infer<typeof ForecastSchema>,
  label: string,
): { m5: number; m6: number } | null {
  const bins = forecast.forecast.find((w) => w.label === label)?.bins ?? []
  const at = (m: number) => bins.find((b) => b.magnitude === m)?.probability
  const m5 = at(5)
  const m6 = at(6)
  return m5 === undefined || m6 === undefined ? null : { m5, m6 }
}

async function fetchJson<T>(
  url: string,
  schema: z.ZodType<T>,
): Promise<T | 'upstream' | 'contract'> {
  let res: Response
  try {
    res = await fetchUpstream(url)
  } catch {
    return 'upstream'
  }
  if (!res.ok) return 'upstream'
  try {
    const parsed = schema.safeParse(await res.json())
    return parsed.success ? parsed.data : 'contract'
  } catch {
    return 'contract'
  }
}

async function forecastFor(quake: Quake): Promise<Outcome> {
  const detail = await fetchJson(quake.properties.detail, DetailSchema)
  if (typeof detail === 'string') return { failed: detail }
  const url = detail.properties.products.oaf[0]?.contents['forecast.json'].url ?? ''
  const forecast = await fetchJson(url, ForecastSchema)
  if (typeof forecast === 'string') return { failed: forecast }
  const day = window(forecast, '1 Day')
  const week = window(forecast, '1 Week')
  if (!day || !week) return { failed: 'contract' }
  const p = quake.properties
  return {
    forecast: {
      id: quake.id,
      mag: p.mag,
      place: p.place ?? '',
      time: p.time,
      url: p.url,
      day,
      week,
    },
  }
}

export const onRequest: PagesFunction = (ctx) =>
  cachedJson(ctx, 'usgs:aftershocks:v1', CACHE_TTL_SECONDS, async () => {
    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10)
    const query = `format=geojson&producttype=oaf&starttime=${since}&orderby=magnitude&limit=${String(MAX_QUAKES)}`
    const search = await fetchJson(`${SEARCH}?${query}`, SearchSchema)
    if (search === 'upstream') return upstreamError(0, 'USGS event search unavailable')
    if (search === 'contract') return contractError('USGS event search changed shape')

    const outcomes = await Promise.all(search.features.map(forecastFor))
    const forecasts = outcomes.flatMap((o) => ('forecast' in o ? [o.forecast] : []))
    const failures = outcomes.flatMap((o) => ('failed' in o ? [o.failed] : []))
    const kind = failures.includes('contract') ? 'contract' : 'upstream'

    if (forecasts.length === 0 && failures.length > 0) {
      return kind === 'contract'
        ? contractError('No USGS aftershock forecast could be read')
        : upstreamError(0, 'USGS aftershock forecasts unavailable')
    }

    // A partial answer says why, so the health check holds an outage but alerts on drift (#71).
    return {
      body: JSON.stringify({ forecasts, updatedAt: new Date().toISOString() }),
      degraded: failures.length > 0,
      ...(failures.length > 0 ? { extraHeaders: { 'X-Error-Kind': kind } } : {}),
    }
  })
