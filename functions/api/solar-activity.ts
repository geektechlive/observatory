import type { PagesFunction } from '@cloudflare/workers-types'
import { z } from 'zod'

import { fluxToClass } from '../../src/schemas/solarActivity'
import { cachedJson, fetchUpstream } from './_cache'

// GOES X-ray flux (flare detector) + NOAA space-weather scales. Public, no key.
const XRAY_FEED = 'https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json'
const SCALES_FEED = 'https://services.swpc.noaa.gov/products/noaa-scales.json'
const CACHE_TTL_SECONDS = 120 // 2 min — GOES updates every minute
const SERIES_POINTS = 60

const XrayRawSchema = z.array(
  z.object({ time_tag: z.string(), flux: z.number().nullable(), energy: z.string() }),
)

const ScaleEntrySchema = z.object({ Scale: z.string().nullable() }).loose()
const ScalesRawSchema = z.record(
  z.string(),
  z.object({
    DateStamp: z.string().optional(),
    R: ScaleEntrySchema.optional(),
    S: ScaleEntrySchema.optional(),
    G: ScaleEntrySchema.optional(),
  }),
)

function downsample(values: number[], target: number): number[] {
  if (values.length <= target) return values
  const out: number[] = []
  for (let i = 0; i < target; i++) {
    const idx = Math.floor((i * (values.length - 1)) / (target - 1))
    out.push(values[idx] as number)
  }
  return out
}

function scaleNum(v: string | null | undefined): number {
  const n = v != null ? parseInt(v, 10) : 0
  return isFinite(n) ? n : 0
}

async function fetchXray(): Promise<{
  series: number[]
  currentFlux: number | null
  currentClass: string | null
  ok: boolean
}> {
  const empty = { series: [], currentFlux: null, currentClass: null, ok: false }
  try {
    const res = await fetchUpstream(XRAY_FEED)
    if (!res.ok) return empty
    const parsed = XrayRawSchema.safeParse(await res.json())
    if (!parsed.success) return empty

    const long = parsed.data
      .filter((p) => p.energy === '0.1-0.8nm' && p.flux !== null)
      .map((p) => p.flux as number)
    if (long.length === 0) return empty

    const currentFlux = long[long.length - 1] ?? null
    return {
      series: downsample(long, SERIES_POINTS),
      currentFlux,
      currentClass: fluxToClass(currentFlux),
      ok: true,
    }
  } catch {
    return empty
  }
}

async function fetchScales(): Promise<{
  scales: { offset: number; date: string; r: number; s: number; g: number }[]
  ok: boolean
}> {
  try {
    const res = await fetchUpstream(SCALES_FEED)
    if (!res.ok) return { scales: [], ok: false }
    const parsed = ScalesRawSchema.safeParse(await res.json())
    if (!parsed.success) return { scales: [], ok: false }

    const out: { offset: number; date: string; r: number; s: number; g: number }[] = []
    for (const offset of [0, 1, 2, 3]) {
      const day = parsed.data[String(offset)]
      if (!day) continue
      out.push({
        offset,
        date: day.DateStamp ?? '',
        r: scaleNum(day.R?.Scale),
        s: scaleNum(day.S?.Scale),
        g: scaleNum(day.G?.Scale),
      })
    }
    return { scales: out, ok: true }
  } catch {
    return { scales: [], ok: false }
  }
}

export const onRequest: PagesFunction = (ctx) =>
  cachedJson(ctx, 'noaa:solar-activity:latest', CACHE_TTL_SECONDS, async () => {
    const [xray, scales] = await Promise.all([fetchXray(), fetchScales()])
    const degraded = !xray.ok || !scales.ok
    return {
      body: JSON.stringify({
        xray: {
          series: xray.series,
          currentFlux: xray.currentFlux,
          currentClass: xray.currentClass,
        },
        scales: scales.scales,
        updatedAt: new Date().toISOString(),
      }),
      degraded,
    }
  })
