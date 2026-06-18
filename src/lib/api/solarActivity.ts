import { SolarActivitySchema } from '@/schemas/solarActivity'
import type { SolarActivity } from '@/schemas/solarActivity'

export async function fetchSolarActivity(): Promise<SolarActivity> {
  const res = await fetch('/api/solar-activity')
  if (!res.ok) throw new Error(`Solar activity fetch failed: ${res.status}`)
  const json: unknown = await res.json()
  return SolarActivitySchema.parse(json)
}
