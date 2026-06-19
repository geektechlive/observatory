import { SwpcAlertsSchema } from '@/schemas/swpcAlerts'
import type { SwpcAlerts } from '@/schemas/swpcAlerts'

export async function fetchSwpcAlerts(): Promise<SwpcAlerts> {
  const res = await fetch('/api/swpc-alerts')
  if (!res.ok) throw new Error(`SWPC alerts fetch failed: ${res.status}`)
  const json: unknown = await res.json()
  return SwpcAlertsSchema.parse(json)
}
