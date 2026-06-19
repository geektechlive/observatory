import { NwsAlertsSchema } from '@/schemas/nws'
import type { NwsAlerts } from '@/schemas/nws'

export async function fetchNwsAlerts(): Promise<NwsAlerts> {
  const res = await fetch('/api/nws-alerts')
  if (!res.ok) throw new Error(`NWS alerts fetch failed: ${res.status}`)
  const json: unknown = await res.json()
  return NwsAlertsSchema.parse(json)
}
