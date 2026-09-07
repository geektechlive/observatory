import type { PagesFunction } from '@cloudflare/workers-types'
import { z } from 'zod'

import { cachedJson, fetchUpstream, upstreamError } from './_cache'
import { fetchPswHour } from './_swpc'

// Kyoto Dst ring-current index. Public NOAA, no key. IMF Bz now comes from
// _swpc.ts's shared 1-hour propagated-solar-wind feed (numeric cells, real
// Bz values) instead of the old 1.1 MB string-cell propagated-solar-wind.json,
// which this endpoint used to read directly and which always yielded an
// empty Bz series.
const DST_FEED = 'https://services.swpc.noaa.gov/products/kyoto-dst.json'
const CACHE_TTL_SECONDS = 300 // 5 min
const UPSTREAM_TIMEOUT_MS = 8000
const BZ_POINTS = 60

// Minimal structural shape of the Pages EventContext — mirrors _swpc.ts's
// SwpcCacheCtx since _cache.ts's CacheCtx isn't exported.
interface GeomagCacheCtx {
  request: { url: string }
  waitUntil(promise: Promise<unknown>): void
}

const DstSchema = z.array(z.object({ time_tag: z.string(), dst: z.number() }))

function downsample(values: number[], target: number): number[] {
  if (values.length <= target) return values
  if (target <= 1) return values.length ? [values[values.length - 1] as number] : []
  const out: number[] = []
  for (let i = 0; i < target; i++) {
    out.push(values[Math.floor((i * (values.length - 1)) / (target - 1))] as number)
  }
  return out
}

async function fetchDst(
  ctx: GeomagCacheCtx,
): Promise<{ series: number[]; current: number | null }> {
  const res = await cachedJson(ctx, 'noaa:dst:raw', CACHE_TTL_SECONDS, async () => {
    try {
      const upstream = await fetchUpstream(DST_FEED, undefined, { timeoutMs: UPSTREAM_TIMEOUT_MS })
      if (!upstream.ok) {
        return upstreamError(upstream.status, `SWPC upstream ${upstream.status} for ${DST_FEED}`)
      }
      const body = await upstream.text()
      return { body }
    } catch (err) {
      return upstreamError(503, `SWPC fetch failed for ${DST_FEED}: ${String(err)}`)
    }
  })
  if (!res.ok) return { series: [], current: null }
  const parsed = DstSchema.safeParse(await res.json())
  if (!parsed.success) return { series: [], current: null }
  const series = parsed.data.slice(-48).map((r) => r.dst)
  return { series, current: series.length ? (series[series.length - 1] ?? null) : null }
}

async function fetchBz(ctx: GeomagCacheCtx): Promise<{ series: number[]; current: number | null }> {
  const rows = await fetchPswHour(ctx)
  const vals = rows.map((r) => r.bz).filter((v): v is number => v !== null)
  return {
    series: downsample(vals, BZ_POINTS),
    current: vals.length ? (vals[vals.length - 1] ?? null) : null,
  }
}

export const onRequest: PagesFunction = (ctx) =>
  cachedJson(ctx, 'noaa:geomag:latest', CACHE_TTL_SECONDS, async () => {
    const [dst, bz] = await Promise.all([fetchDst(ctx), fetchBz(ctx)])
    const degraded = dst.series.length === 0 || bz.series.length === 0

    return {
      body: JSON.stringify({
        dstSeries: dst.series,
        currentDst: dst.current,
        bzSeries: bz.series,
        currentBz: bz.current,
        updatedAt: new Date().toISOString(),
      }),
      degraded,
    }
  })
