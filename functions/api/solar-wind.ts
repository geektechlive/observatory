import type { PagesFunction } from '@cloudflare/workers-types'
import { z } from 'zod'
import { cachedJson } from './_cache'

const SolarWindRow = z.array(z.string())
const SolarWindRawSchema = z.array(SolarWindRow)

const CACHE_TTL_SECONDS = 300 // 5 min — NOAA updates every 3h for Kp, every min for plasma

function parseNum(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return isFinite(n) ? n : null
}

const SERIES_WINDOW_ROWS = 1440 // last ~24h of 1-minute NOAA samples
const SERIES_POINTS = 48 // downsample target for the trend sparkline

/**
 * Pull the last ~24h of a numeric column from NOAA's columnar [header, ...rows]
 * payload and stride-sample it down to ~48 points for a trend sparkline.
 * Drops null cells so the result is a clean number[] (callers want no gaps).
 */
function extractSeries(raw: string[][], colIndex: number): number[] {
  const window = raw.slice(1).slice(-SERIES_WINDOW_ROWS)
  const vals: number[] = []
  for (const row of window) {
    const n = parseNum(row[colIndex])
    if (n !== null) vals.push(n)
  }
  if (vals.length <= SERIES_POINTS) return vals
  const out: number[] = []
  for (let i = 0; i < SERIES_POINTS; i++) {
    const idx = Math.floor((i * (vals.length - 1)) / (SERIES_POINTS - 1))
    out.push(vals[idx] as number)
  }
  return out
}

async function fetchKp(): Promise<{
  readings: { time: string; kp: number }[]
  current: number | null
}> {
  const res = await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json')
  if (!res.ok) return { readings: [], current: null }
  const json: unknown = await res.json()
  const parsed = SolarWindRawSchema.safeParse(json)
  if (!parsed.success) return { readings: [], current: null }
  const raw = parsed.data

  const readings: { time: string; kp: number }[] = []
  for (const row of raw) {
    if (row.length < 2) continue
    const time = row[0] ?? null
    const kp = parseNum(row[1])
    if (time !== null && kp !== null) readings.push({ time, kp })
  }

  const last24h = readings.slice(-8)
  const current = last24h.length > 0 ? (last24h[last24h.length - 1]?.kp ?? null) : null
  return { readings: last24h, current }
}

async function fetchPlasma(): Promise<{
  speed: number | null
  density: number | null
  speedSeries: number[]
  densitySeries: number[]
}> {
  const empty = { speed: null, density: null, speedSeries: [], densitySeries: [] }
  const res = await fetch('https://services.swpc.noaa.gov/products/solar-wind/plasma-7-day.json')
  if (!res.ok) return empty
  const json: unknown = await res.json()
  const parsed = SolarWindRawSchema.safeParse(json)
  if (!parsed.success || parsed.data.length < 2) return empty
  const raw = parsed.data

  // Columns: [time_tag, density, speed, temperature]
  const speedSeries = extractSeries(raw, 2)
  const densitySeries = extractSeries(raw, 1)

  // First row is header — iterate in reverse to find last valid row
  for (let i = raw.length - 1; i >= 1; i--) {
    const row = raw[i]
    if (!row || row.length < 3) continue
    const density = parseNum(row[1])
    const speed = parseNum(row[2])
    if (speed !== null && density !== null) return { speed, density, speedSeries, densitySeries }
  }
  return { ...empty, speedSeries, densitySeries }
}

async function fetchMag(): Promise<{ imfBz: number | null; bzSeries: number[] }> {
  const res = await fetch('https://services.swpc.noaa.gov/products/solar-wind/mag-7-day.json')
  if (!res.ok) return { imfBz: null, bzSeries: [] }
  const json: unknown = await res.json()
  const parsed = SolarWindRawSchema.safeParse(json)
  if (!parsed.success || parsed.data.length < 2) return { imfBz: null, bzSeries: [] }
  const raw = parsed.data

  // Columns: [time_tag, bx_gsm, by_gsm, bz_gsm, lon_gsm, lat_gsm, bt]
  const bzSeries = extractSeries(raw, 3)

  // First row is header — bz_gsm is index 3
  for (let i = raw.length - 1; i >= 1; i--) {
    const row = raw[i]
    if (!row || row.length < 4) continue
    const bz = parseNum(row[3])
    if (bz !== null) return { imfBz: bz, bzSeries }
  }
  return { imfBz: null, bzSeries }
}

export const onRequest: PagesFunction = (ctx) =>
  cachedJson(ctx, 'noaa:solar-wind:latest', CACHE_TTL_SECONDS, async () => {
    const [kpResult, plasmaResult, magResult] = await Promise.all([
      fetchKp(),
      fetchPlasma(),
      fetchMag(),
    ])

    return {
      body: JSON.stringify({
        kpReadings: kpResult.readings,
        currentKp: kpResult.current,
        windSpeed: plasmaResult.speed,
        windDensity: plasmaResult.density,
        imfBz: magResult.imfBz,
        windSpeedSeries: plasmaResult.speedSeries,
        windDensitySeries: plasmaResult.densitySeries,
        imfBzSeries: magResult.bzSeries,
        updatedAt: new Date().toISOString(),
      }),
    }
  })
