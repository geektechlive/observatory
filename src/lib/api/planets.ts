import { PlanetsResponseSchema } from '@/schemas/planets'
import type { PlanetsResponse } from '@/schemas/planets'

export async function fetchPlanets(): Promise<PlanetsResponse> {
  const res = await fetch('/api/planets')
  if (!res.ok) throw new Error(`Planets fetch failed: ${res.status}`)
  const json: unknown = await res.json()
  return PlanetsResponseSchema.parse(json)
}
