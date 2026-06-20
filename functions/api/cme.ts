import type { PagesFunction } from '@cloudflare/workers-types'
import { z } from 'zod'
import { cachedJson } from './_cache'

// NOAA WSA-ENLIL solar wind model time series. Public, no key.
// `cloud` is non-null for time steps inside a modeled (Earth-directed) CME.
const SOURCE = 'https://services.swpc.noaa.gov/json/enlil_time_series.json'
const CACHE_TTL_SECONDS = 3 * 3600 // 3h — model reruns every several hours

const RawSchema = z.array(
  z.object({
    time_tag: z.string(),
    earth_particles_per_cm3: z.number().nullable().optional(),
    v_r: z.number().nullable().optional(),
    cloud: z.union([z.string(), z.number(), z.null()]).optional(),
  }),
)

export const onRequest: PagesFunction = (ctx) =>
  cachedJson(ctx, 'noaa:cme:enlil:v1', CACHE_TTL_SECONDS, async () => {
    const upstream = await fetch(SOURCE)
    if (!upstream.ok) {
      return new Response(JSON.stringify({ error: 'Upstream ENLIL error' }), {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const parsed = RawSchema.safeParse(await upstream.json())
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'Invalid upstream response' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const rows = parsed.data
    const nowIso = new Date().toISOString()
    const cmeRow = rows.find((r) => r.cloud != null && r.cloud !== '' && r.time_tag > nowIso)
    const last = rows[rows.length - 1]

    return {
      body: JSON.stringify({
        inbound: cmeRow !== undefined,
        arrival: cmeRow?.time_tag ?? null,
        earthSpeed: typeof last?.v_r === 'number' ? last.v_r : null,
        earthDensity:
          typeof last?.earth_particles_per_cm3 === 'number' ? last.earth_particles_per_cm3 : null,
        updatedAt: nowIso,
      }),
    }
  })
