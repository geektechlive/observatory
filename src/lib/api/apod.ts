import { ApodSchema, type Apod } from '@/schemas/apod'

export async function fetchApod(): Promise<Apod> {
  const res = await fetch('/api/apod')
  if (!res.ok) throw new Error(`APOD fetch failed: ${res.status}`)
  const data: unknown = await res.json()
  return ApodSchema.parse(data)
}
