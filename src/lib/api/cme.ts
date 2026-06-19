import { CmeSchema } from '@/schemas/cme'
import type { Cme } from '@/schemas/cme'

export async function fetchCme(): Promise<Cme> {
  const res = await fetch('/api/cme')
  if (!res.ok) throw new Error(`CME fetch failed: ${res.status}`)
  const json: unknown = await res.json()
  return CmeSchema.parse(json)
}
