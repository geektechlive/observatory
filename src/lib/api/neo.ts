import { NeoResponseSchema, type NeoResponse } from '@/schemas/neo'

export async function fetchNeo(): Promise<NeoResponse> {
  const res = await fetch('/api/neo')
  if (!res.ok) throw new Error(`NeoWs fetch failed: ${res.status}`)
  const data: unknown = await res.json()
  return NeoResponseSchema.parse(data)
}
