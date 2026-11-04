import { apiFetch } from '@/lib/api/client'
import type { Aurora } from '@/schemas/aurora'
import { AuroraSchema } from '@/schemas/aurora'

export async function fetchAurora(): Promise<Aurora> {
  const res = await apiFetch('/api/aurora')
  if (!res.ok) throw new Error(`Aurora fetch failed: ${res.status}`)
  const json: unknown = await res.json()
  return AuroraSchema.parse(json)
}
