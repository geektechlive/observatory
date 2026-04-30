import { SolarWindSchema, type SolarWind } from '@/schemas/solarWind'

export async function fetchSolarWind(): Promise<SolarWind> {
  const res = await fetch('/api/solar-wind')
  if (!res.ok) throw new Error(`Solar wind fetch failed: ${res.status}`)
  const data: unknown = await res.json()
  return SolarWindSchema.parse(data)
}
