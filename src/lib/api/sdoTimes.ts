import type { SdoTimesResponse } from '@/schemas/sdoTimes'
import { SdoTimesSchema } from '@/schemas/sdoTimes'

export async function fetchSdoTimes(): Promise<SdoTimesResponse> {
  const res = await fetch('/api/sdo-times')
  if (!res.ok) throw new Error(`SDO times fetch failed: ${res.status}`)
  const json: unknown = await res.json()
  return SdoTimesSchema.parse(json)
}
