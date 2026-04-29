import { SentryResponseSchema, type SentryResponse } from '@/schemas/sentry'

export async function fetchSentry(): Promise<SentryResponse> {
  const res = await fetch('/api/sentry')
  if (!res.ok) throw new Error(`Sentry fetch failed: ${res.status}`)
  const data: unknown = await res.json()
  return SentryResponseSchema.parse(data)
}
