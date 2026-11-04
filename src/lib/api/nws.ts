import { apiFetch } from '@/lib/api/client'
import type { NwsAlerts } from '@/schemas/nws'
import { NwsAlertsSchema } from '@/schemas/nws'

export async function fetchNwsAlerts(): Promise<NwsAlerts> {
  const res = await apiFetch('/api/nws-alerts')
  if (!res.ok) throw new Error(`NWS alerts fetch failed: ${res.status}`)
  const json: unknown = await res.json()
  return NwsAlertsSchema.parse(json)
}
