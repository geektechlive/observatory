import { DonkiResponseSchema, type DonkiResponse } from '@/schemas/donki'
import { trackQuota } from '@/lib/api/quota'

export async function fetchDonki(): Promise<DonkiResponse> {
  const res = await fetch('/api/donki')
  trackQuota(res)
  if (!res.ok) throw new Error(`DONKI fetch failed: ${res.status}`)
  const data: unknown = await res.json()
  return DonkiResponseSchema.parse(data)
}
