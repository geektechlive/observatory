import { ExoplanetsSchema } from '@/schemas/exoplanets'
import type { Exoplanets } from '@/schemas/exoplanets'

export async function fetchExoplanets(): Promise<Exoplanets> {
  const res = await fetch('/api/exoplanets')
  if (!res.ok) throw new Error(`Exoplanets fetch failed: ${res.status}`)
  const json: unknown = await res.json()
  return ExoplanetsSchema.parse(json)
}
