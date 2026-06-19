import { AuroraSchema } from '@/schemas/aurora'
import type { Aurora } from '@/schemas/aurora'

export async function fetchAurora(): Promise<Aurora> {
  const res = await fetch('/api/aurora')
  if (!res.ok) throw new Error(`Aurora fetch failed: ${res.status}`)
  const json: unknown = await res.json()
  return AuroraSchema.parse(json)
}
