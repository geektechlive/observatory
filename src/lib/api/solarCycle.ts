import { SolarCycleSchema } from '@/schemas/solarCycle'
import type { SolarCycle } from '@/schemas/solarCycle'

export async function fetchSolarCycle(): Promise<SolarCycle> {
  const res = await fetch('/api/solar-cycle')
  if (!res.ok) throw new Error(`Solar cycle fetch failed: ${res.status}`)
  const json: unknown = await res.json()
  return SolarCycleSchema.parse(json)
}
