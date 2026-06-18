import { GdacsResponseSchema } from '@/schemas/gdacs'
import type { GdacsResponse } from '@/schemas/gdacs'

export async function fetchGdacs(): Promise<GdacsResponse> {
  const res = await fetch('/api/gdacs')
  if (!res.ok) throw new Error(`GDACS fetch failed: ${res.status}`)
  const json: unknown = await res.json()
  return GdacsResponseSchema.parse(json)
}
