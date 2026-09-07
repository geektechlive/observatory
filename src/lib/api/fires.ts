import type { FiresResponse } from '@/schemas/fires'
import { FiresResponseSchema } from '@/schemas/fires'

export async function fetchFires(): Promise<FiresResponse> {
  const res = await fetch('/api/fires')
  if (!res.ok) throw new Error(`Fires fetch failed: ${res.status}`)
  const json: unknown = await res.json()
  return FiresResponseSchema.parse(json)
}
