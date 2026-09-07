import { type SolarWind, SolarWindSchema } from '@/schemas/solarWind'

import { getJsonMeta, type SourceEnvelope } from './client'

export async function fetchSolarWind(): Promise<SolarWind> {
  const res = await fetch('/api/solar-wind')
  if (!res.ok) throw new Error(`Solar wind fetch failed: ${res.status}`)
  const data: unknown = await res.json()
  return SolarWindSchema.parse(data)
}

/**
 * Envelope variant used by useSourceQuery: carries the X-Data-Degraded and
 * X-Data-Age headers alongside the payload so the header can grade this source.
 */
export function fetchSolarWindEnvelope(): Promise<SourceEnvelope<SolarWind>> {
  return getJsonMeta('/api/solar-wind', SolarWindSchema)
}
