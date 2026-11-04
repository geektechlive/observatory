import { apiFetch } from '@/lib/api/client'
import type { PlanetsResponse } from '@/schemas/planets'
import { PlanetsResponseSchema } from '@/schemas/planets'

export async function fetchPlanets(): Promise<PlanetsResponse> {
  const res = await apiFetch('/api/planets')
  if (!res.ok) throw new Error(`Planets fetch failed: ${res.status}`)
  const json: unknown = await res.json()
  return PlanetsResponseSchema.parse(json)
}
