import { apiFetch } from '@/lib/api/client'
import type { PeopleInSpace } from '@/schemas/peopleInSpace'
import { PeopleInSpaceSchema } from '@/schemas/peopleInSpace'

export async function fetchPeopleInSpace(): Promise<PeopleInSpace> {
  const res = await apiFetch('/api/people-in-space')
  if (!res.ok) throw new Error(`People-in-space fetch failed: ${res.status}`)
  const json: unknown = await res.json()
  return PeopleInSpaceSchema.parse(json)
}
