import { LaunchesResponseSchema, type LaunchesResponse } from '@/schemas/launches'

export async function fetchLaunches(): Promise<LaunchesResponse> {
  const res = await fetch('/api/launches')
  if (!res.ok) throw new Error(`Launches fetch failed: ${res.status}`)
  const data: unknown = await res.json()
  return LaunchesResponseSchema.parse(data)
}
