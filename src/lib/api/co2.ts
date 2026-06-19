import { Co2Schema } from '@/schemas/co2'
import type { Co2 } from '@/schemas/co2'

export async function fetchCo2(): Promise<Co2> {
  const res = await fetch('/api/co2')
  if (!res.ok) throw new Error(`CO2 fetch failed: ${res.status}`)
  const json: unknown = await res.json()
  return Co2Schema.parse(json)
}
