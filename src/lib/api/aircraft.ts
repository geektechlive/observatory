import { apiFetch } from '@/lib/api/client'
import type { AircraftResponse } from '@/schemas/aircraft'
import { AircraftResponseSchema } from '@/schemas/aircraft'

export async function fetchAircraft(): Promise<AircraftResponse> {
  const res = await apiFetch('/api/aircraft')
  if (!res.ok) throw new Error(`Aircraft fetch failed: ${res.status}`)
  const json: unknown = await res.json()
  return AircraftResponseSchema.parse(json)
}
