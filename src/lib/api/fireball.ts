import { FireballResponseSchema, type FireballResponse } from '@/schemas/fireball'

export async function fetchFireball(): Promise<FireballResponse> {
  const res = await fetch('/api/fireball')
  if (!res.ok) throw new Error(`Fireball fetch failed: ${res.status}`)
  const data: unknown = await res.json()
  return FireballResponseSchema.parse(data)
}
