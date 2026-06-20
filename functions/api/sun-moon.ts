import type { PagesFunction } from '@cloudflare/workers-types'
import { z } from 'zod'
import { cachedJson } from './_cache'

// USNO sun/moon rise-set-twilight + moon phase. Public, no key. Proxied so we
// can cache by rounded location and avoid CORS/CSP on the client.
const USNO_API = 'https://aa.usno.navy.mil/api/rstt/oneday'
const CACHE_TTL_SECONDS = 6 * 3600 // 6h — per-day almanac data

const PhenSchema = z.array(z.object({ phen: z.string(), time: z.string() }))
const UsnoRawSchema = z.object({
  properties: z.object({
    data: z.object({
      curphase: z.string().optional(),
      fracillum: z.string().optional(),
      closestphase: z
        .object({
          phase: z.string(),
          day: z.number(),
          month: z.number(),
          year: z.number(),
          time: z.string(),
        })
        .optional(),
      sundata: PhenSchema.optional(),
      moondata: PhenSchema.optional(),
    }),
  }),
})

function timeOf(arr: { phen: string; time: string }[] | undefined, phen: string): string | null {
  return arr?.find((p) => p.phen === phen)?.time ?? null
}

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

export const onRequest: PagesFunction = (ctx) => {
  const url = new URL(ctx.request.url)
  const lat = parseFloat(url.searchParams.get('lat') ?? '')
  const lon = parseFloat(url.searchParams.get('lon') ?? '')
  const tz = parseFloat(url.searchParams.get('tz') ?? '0')
  const date = url.searchParams.get('date') ?? ''

  if (!isFinite(lat) || !isFinite(lon) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Promise.resolve(
      new Response(JSON.stringify({ error: 'Invalid lat/lon/date' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
  }

  // Round location to ~11km so nearby visitors share a cache entry.
  const latR = lat.toFixed(1)
  const lonR = lon.toFixed(1)
  const tzR = isFinite(tz) ? tz : 0
  const cacheKey = `usno:sunmoon:${latR}:${lonR}:${tzR}:${date}`

  return cachedJson(ctx, cacheKey, CACHE_TTL_SECONDS, async () => {
    const upstream = await fetch(`${USNO_API}?date=${date}&coords=${latR},${lonR}&tz=${tzR}`)
    if (!upstream.ok) {
      return new Response(JSON.stringify({ error: 'Upstream USNO error' }), {
        status: upstream.status,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const parsed = UsnoRawSchema.safeParse(await upstream.json())
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid upstream response', details: parsed.error.flatten() }),
        { status: 502, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const d = parsed.data.properties.data
    const cp = d.closestphase
    return {
      body: JSON.stringify({
        date,
        tz: tzR,
        lat: parseFloat(latR),
        lon: parseFloat(lonR),
        curPhase: d.curphase ?? 'Unknown',
        fracIllum: d.fracillum ? parseInt(d.fracillum, 10) || 0 : 0,
        closestPhase: cp
          ? { phase: cp.phase, date: `${cp.year}-${pad2(cp.month)}-${pad2(cp.day)}`, time: cp.time }
          : null,
        sun: {
          rise: timeOf(d.sundata, 'Rise'),
          set: timeOf(d.sundata, 'Set'),
          transit: timeOf(d.sundata, 'Upper Transit'),
          civilBegin: timeOf(d.sundata, 'Begin Civil Twilight'),
          civilEnd: timeOf(d.sundata, 'End Civil Twilight'),
        },
        moon: {
          rise: timeOf(d.moondata, 'Rise'),
          set: timeOf(d.moondata, 'Set'),
        },
        updatedAt: new Date().toISOString(),
      }),
    }
  })
}
