import { AircraftResponseSchema } from '@/schemas/aircraft'
import type { AircraftResponse } from '@/schemas/aircraft'

export async function fetchAircraft(): Promise<AircraftResponse> {
  const res = await fetch('/api/aircraft')
  if (!res.ok) throw new Error(`Aircraft fetch failed: ${res.status}`)
  const json: unknown = await res.json()
  return AircraftResponseSchema.parse(json)
}
