import { apiFetch } from '@/lib/api/client'
import { type FireballResponse, FireballResponseSchema } from '@/schemas/fireball'

export async function fetchFireball(): Promise<FireballResponse> {
  const res = await apiFetch('/api/fireball')
  if (!res.ok) throw new Error(`Fireball fetch failed: ${res.status}`)
  const data: unknown = await res.json()
  return FireballResponseSchema.parse(data)
}
