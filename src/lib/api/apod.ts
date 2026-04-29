import { ApodSchema, type Apod } from '@/schemas/apod'
import { trackQuota } from './quota'

export async function fetchApod(): Promise<Apod> {
  const res = await fetch('/api/apod')
  if (!res.ok) throw new Error(`APOD fetch failed: ${res.status}`)
  trackQuota(res)
  const data: unknown = await res.json()
  return ApodSchema.parse(data)
}
