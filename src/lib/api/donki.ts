import { DonkiResponseSchema, type DonkiResponse } from '@/schemas/donki'

export async function fetchDonki(): Promise<DonkiResponse> {
  const res = await fetch('/api/donki')
  if (!res.ok) throw new Error(`DONKI fetch failed: ${res.status}`)
  const data: unknown = await res.json()
  return DonkiResponseSchema.parse(data)
}
