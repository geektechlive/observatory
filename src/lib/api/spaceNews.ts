import { SpaceNewsSchema } from '@/schemas/spaceNews'
import type { SpaceNews } from '@/schemas/spaceNews'

export async function fetchSpaceNews(): Promise<SpaceNews> {
  const res = await fetch('/api/space-news')
  if (!res.ok) throw new Error(`Space news fetch failed: ${res.status}`)
  const json: unknown = await res.json()
  return SpaceNewsSchema.parse(json)
}
