import type { PagesFunction } from '@cloudflare/workers-types'
import { z } from 'zod'

// Kyoto Dst ring-current index + propagated L1 IMF Bz. Public NOAA, no key.
const DST_FEED = 'https://services.swpc.noaa.gov/products/kyoto-dst.json'
const PSW_FEED = 'https://services.swpc.noaa.gov/products/geospace/propagated-solar-wind.json'
const CACHE_TTL_SECONDS = 300 // 5 min
const BZ_POINTS = 60
const BZ_WINDOW = 1440 // last ~24h of 1-min samples

interface Env {
  OBSERVATORY_CACHE: KVNamespace
}

const DstSchema = z.array(z.object({ time_tag: z.string(), dst: z.number() }))
const PswSchema = z.array(z.array(z.union([z.string(), z.null()])))

function downsample(values: number[], target: number): number[] {
  if (values.length <= target) return values
  const out: number[] = []
  for (let i = 0; i < target; i++) {
    out.push(values[Math.floor((i * (values.length - 1)) / (target - 1))] as number)
  }
  return out
}

async function fetchDst(): Promise<{ series: number[]; current: number | null }> {
  const res = await fetch(DST_FEED)
  if (!res.ok) return { series: [], current: null }
  const parsed = DstSchema.safeParse(await res.json())
  if (!parsed.success) return { series: [], current: null }
  const series = parsed.data.slice(-48).map((r) => r.dst)
  return { series, current: series.length ? (series[series.length - 1] ?? null) : null }
}

async function fetchBz(): Promise<{ series: number[]; current: number | null }> {
  const res = await fetch(PSW_FEED)
  if (!res.ok) return { series: [], current: null }
  const parsed = PswSchema.safeParse(await res.json())
  if (!parsed.success || parsed.data.length < 2) return { series: [], current: null }
  // [time, speed, density, temp, bx, by, bz(=6), ...]; first row is the header.
  const rows = parsed.data.slice(1).slice(-BZ_WINDOW)
  const vals: number[] = []
  for (const r of rows) {
    const v = r[6]
    const n = typeof v === 'string' ? parseFloat(v) : NaN
    if (isFinite(n)) vals.push(n)
  }
  return {
    series: downsample(vals, BZ_POINTS),
    current: vals.length ? (vals[vals.length - 1] ?? null) : null,
  }
}

export const onRequest: PagesFunction<Env> = async ({ env }) => {
  const kvKey = 'noaa:geomag:latest'

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

  const [dst, bz] = await Promise.all([fetchDst(), fetchBz()])
  const body = JSON.stringify({
    dstSeries: dst.series,
    currentDst: dst.current,
    bzSeries: bz.series,
    currentBz: bz.current,
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
