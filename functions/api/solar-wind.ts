import type { PagesFunction } from '@cloudflare/workers-types'

import { cachedJson } from './_cache'
import { fetchKpReadings, fetchPswHour } from './_swpc'

const CACHE_TTL_SECONDS = 300 // 5 min — NOAA updates every 3h for Kp, every min for plasma
const SERIES_POINTS = 48 // downsample target for the trend sparkline

/** Stride-sample a numeric series down to `target` points. */
function downsample(values: number[], target: number): number[] {
  if (values.length <= target) return values
  if (target <= 1) return values.length ? [values[values.length - 1] as number] : []
  const out: number[] = []
  for (let i = 0; i < target; i++) {
    out.push(values[Math.floor((i * (values.length - 1)) / (target - 1))] as number)
  }
  return out
}

function lastNonNull(values: (number | null)[]): number | null {
  for (let i = values.length - 1; i >= 0; i--) {
    const v = values[i]
    if (v !== null && v !== undefined) return v
  }
  return null
}

export const onRequest: PagesFunction = (ctx) =>
  cachedJson(ctx, 'noaa:solar-wind:latest', CACHE_TTL_SECONDS, async () => {
    const [kpReadings, pswReadings] = await Promise.all([fetchKpReadings(ctx), fetchPswHour(ctx)])

    const last8Kp = kpReadings.slice(-8)
    const currentKp = last8Kp.length > 0 ? (last8Kp[last8Kp.length - 1]?.kp ?? null) : null

    const speedValues = pswReadings.map((r) => r.speed)
    const densityValues = pswReadings.map((r) => r.density)
    const bzValues = pswReadings.map((r) => r.bz)

    const windSpeedSeries = downsample(
      speedValues.filter((v): v is number => v !== null),
      SERIES_POINTS,
    )
    const windDensitySeries = downsample(
      densityValues.filter((v): v is number => v !== null),
      SERIES_POINTS,
    )
    const imfBzSeries = downsample(
      bzValues.filter((v): v is number => v !== null),
      SERIES_POINTS,
    )

    const windSpeed = lastNonNull(speedValues)
    const windDensity = lastNonNull(densityValues)
    const imfBz = lastNonNull(bzValues)

    const degraded = last8Kp.length === 0 || windSpeed === null || imfBz === null

    return {
      body: JSON.stringify({
        kpReadings: last8Kp,
        currentKp,
        windSpeed,
        windDensity,
        imfBz,
        windSpeedSeries,
        windDensitySeries,
        imfBzSeries,
        updatedAt: new Date().toISOString(),
      }),
      degraded,
    }
  })
