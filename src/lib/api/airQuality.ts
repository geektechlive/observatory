import { apiFetch } from '@/lib/api/client'
import type { AirQualityResponse } from '@/schemas/airQuality'
import { AirQualityResponseSchema } from '@/schemas/airQuality'

export async function fetchAirQuality(): Promise<AirQualityResponse> {
  const res = await apiFetch('/api/air-quality')
  if (!res.ok) throw new Error(`Air quality fetch failed: ${res.status}`)
  const json: unknown = await res.json()
  return AirQualityResponseSchema.parse(json)
}
