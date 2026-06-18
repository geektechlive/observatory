import type { PagesFunction } from '@cloudflare/workers-types'
import { z } from 'zod'
import { fluxToClass } from '../../src/schemas/solarActivity'

// GOES X-ray flux (flare detector) + NOAA space-weather scales. Public, no key.
const XRAY_FEED = 'https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json'
const SCALES_FEED = 'https://services.swpc.noaa.gov/products/noaa-scales.json'
const CACHE_TTL_SECONDS = 120 // 2 min — GOES updates every minute
const SERIES_POINTS = 60

interface Env {
  OBSERVATORY_CACHE: KVNamespace
}

const XrayRawSchema = z.array(
  z.object({ time_tag: z.string(), flux: z.number().nullable(), energy: z.string() }),
)

const ScaleEntrySchema = z.object({ Scale: z.string().nullable() }).passthrough()
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
}> {
  const empty = { series: [], currentFlux: null, currentClass: null }
  const res = await fetch(XRAY_FEED)
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
  }
}

async function fetchScales(): Promise<
  { offset: number; date: string; r: number; s: number; g: number }[]
> {
  const res = await fetch(SCALES_FEED)
  if (!res.ok) return []
  const parsed = ScalesRawSchema.safeParse(await res.json())
  if (!parsed.success) return []

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
  return out
}

export const onRequest: PagesFunction<Env> = async ({ env }) => {
  const kvKey = 'noaa:solar-activity:latest'

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

  const [xray, scales] = await Promise.all([fetchXray(), fetchScales()])

  const body = JSON.stringify({ xray, scales, updatedAt: new Date().toISOString() })
  await env.OBSERVATORY_CACHE.put(kvKey, body, { expirationTtl: CACHE_TTL_SECONDS })

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'X-Cache': 'MISS',
      'X-Cache-TTL': String(CACHE_TTL_SECONDS),
    },
  })
}
