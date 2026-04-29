import { EonetResponseSchema } from '@/schemas/eonet'
import type { EonetResponse } from '@/schemas/eonet'

export async function fetchEonetEvents(): Promise<EonetResponse> {
  const res = await fetch('/api/eonet')
  if (!res.ok) throw new Error(`EONET fetch failed: ${res.status}`)
  const json: unknown = await res.json()
  return EonetResponseSchema.parse(json)
}
