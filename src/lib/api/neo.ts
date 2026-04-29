import { NeoResponseSchema, type NeoResponse } from '@/schemas/neo'
import { trackQuota } from './quota'

export async function fetchNeo(): Promise<NeoResponse> {
  const res = await fetch('/api/neo')
  if (!res.ok) throw new Error(`NeoWs fetch failed: ${res.status}`)
  trackQuota(res)
  const data: unknown = await res.json()
  return NeoResponseSchema.parse(data)
}
