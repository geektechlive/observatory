import { IssTleSchema } from '@/schemas/iss-tle'
import type { IssTle } from '@/schemas/iss-tle'

export async function fetchIssTle(): Promise<IssTle> {
  const res = await fetch('/api/iss-tle')
  if (!res.ok) throw new Error(`ISS TLE fetch failed: ${res.status}`)
  const json: unknown = await res.json()
  return IssTleSchema.parse(json)
}
