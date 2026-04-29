import { SentryResponseSchema, type SentryResponse } from '@/schemas/sentry'
import { trackQuota } from './quota'

export async function fetchSentry(): Promise<SentryResponse> {
  const res = await fetch('/api/sentry')
  if (!res.ok) throw new Error(`Sentry fetch failed: ${res.status}`)
  trackQuota(res)
  const data: unknown = await res.json()
  return SentryResponseSchema.parse(data)
}
