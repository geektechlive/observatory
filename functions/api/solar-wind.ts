import type { PagesFunction } from '@cloudflare/workers-types'
import { z } from 'zod'

const SolarWindRow = z.array(z.string())
const SolarWindRawSchema = z.array(SolarWindRow)

const CACHE_TTL_SECONDS = 300 // 5 min — NOAA updates every 3h for Kp, every min for plasma

interface Env {
  OBSERVATORY_CACHE: KVNamespace
}

function parseNum(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'string' ? parseFloat(v) : Number(v)
  return isFinite(n) ? n : null
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

async function fetchPlasma(): Promise<{ speed: number | null; density: number | null }> {
  const res = await fetch('https://services.swpc.noaa.gov/products/solar-wind/plasma-7-day.json')
  if (!res.ok) return { speed: null, density: null }
  const json: unknown = await res.json()
  const parsed = SolarWindRawSchema.safeParse(json)
  if (!parsed.success || parsed.data.length < 2) return { speed: null, density: null }
  const raw = parsed.data

  // First row is header — iterate in reverse to find last valid row
  for (let i = raw.length - 1; i >= 1; i--) {
    const row = raw[i]
    if (!row || row.length < 3) continue
    const density = parseNum(row[1])
    const speed = parseNum(row[2])
    if (speed !== null && density !== null) return { speed, density }
  }
  return { speed: null, density: null }
}

async function fetchMag(): Promise<{ imfBz: number | null }> {
  const res = await fetch('https://services.swpc.noaa.gov/products/solar-wind/mag-7-day.json')
  if (!res.ok) return { imfBz: null }
  const json: unknown = await res.json()
  const parsed = SolarWindRawSchema.safeParse(json)
  if (!parsed.success || parsed.data.length < 2) return { imfBz: null }
  const raw = parsed.data

  // First row is header — bz_gsm is index 3
  for (let i = raw.length - 1; i >= 1; i--) {
    const row = raw[i]
    if (!row || row.length < 4) continue
    const bz = parseNum(row[3])
    if (bz !== null) return { imfBz: bz }
  }
  return { imfBz: null }
}

export const onRequest: PagesFunction<Env> = async ({ env }) => {
  const kvKey = 'noaa:solar-wind:latest'

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

  const [kpResult, plasmaResult, magResult] = await Promise.all([
    fetchKp(),
    fetchPlasma(),
    fetchMag(),
  ])

  const result = {
    kpReadings: kpResult.readings,
    currentKp: kpResult.current,
    windSpeed: plasmaResult.speed,
    windDensity: plasmaResult.density,
    imfBz: magResult.imfBz,
    updatedAt: new Date().toISOString(),
  }

  const body = JSON.stringify(result)
  await env.OBSERVATORY_CACHE.put(kvKey, body, { expirationTtl: CACHE_TTL_SECONDS })

  return new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'X-Cache': 'MISS',
      'X-Cache-TTL': String(CACHE_TTL_SECONDS),
    },
  })
}
