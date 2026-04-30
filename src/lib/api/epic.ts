import { EpicResponseSchema, type EpicResponse } from '@/schemas/epic'
import { trackQuota } from './quota'

export async function fetchEpic(): Promise<EpicResponse> {
  const res = await fetch('/api/epic')
  if (!res.ok) throw new Error(`EPIC fetch failed: ${res.status}`)
  trackQuota(res)
  const data: unknown = await res.json()
  return EpicResponseSchema.parse(data)
}
