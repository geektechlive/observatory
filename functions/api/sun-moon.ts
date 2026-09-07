import type { PagesFunction } from '@cloudflare/workers-types'
import { z } from 'zod'

import { cachedJson, fetchUpstream, upstreamError } from './_cache'

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

function badRequest(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  })
}

export const onRequest: PagesFunction = (ctx) => {
  const url = new URL(ctx.request.url)
  const lat = parseFloat(url.searchParams.get('lat') ?? '')
  const lon = parseFloat(url.searchParams.get('lon') ?? '')
  const tz = parseFloat(url.searchParams.get('tz') ?? '0')
  const date = url.searchParams.get('date') ?? ''

  if (!isFinite(lat) || lat < -90 || lat > 90)
    return Promise.resolve(badRequest('lat must be a number in [-90, 90]'))
  if (!isFinite(lon) || lon < -180 || lon > 180)
    return Promise.resolve(badRequest('lon must be a number in [-180, 180]'))
  if (!isFinite(tz) || tz < -12 || tz > 14 || Math.abs(tz / 0.25 - Math.round(tz / 0.25)) > 1e-9)
    return Promise.resolve(badRequest('tz must be a multiple of 0.25 in [-12, 14]'))
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return Promise.resolve(badRequest('date must be formatted YYYY-MM-DD'))

  // Round location to 2 decimals (~1.1km) so nearby visitors share a cache entry.
  const latR = lat.toFixed(2)
  const lonR = lon.toFixed(2)
  const tzR = tz
  const cacheKey = `usno:sunmoon:${latR}:${lonR}:${tzR}:${date}`

  return cachedJson(ctx, cacheKey, CACHE_TTL_SECONDS, async () => {
    const upstream = await fetchUpstream(
      `${USNO_API}?date=${date}&coords=${latR},${lonR}&tz=${tzR}`,
    )
    if (!upstream.ok) return upstreamError(upstream.status, 'USNO upstream error')

    const parsed = UsnoRawSchema.safeParse(await upstream.json())
    if (!parsed.success) {
      console.warn('[sun-moon] invalid upstream response', parsed.error.issues)
      return upstreamError(502, 'Invalid USNO response')
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
