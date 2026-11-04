import { apiFetch } from '@/lib/api/client'
import type { MarsWeather } from '@/schemas/marsWeather'
import { MarsWeatherSchema } from '@/schemas/marsWeather'

export async function fetchMarsWeather(): Promise<MarsWeather> {
  const res = await apiFetch('/api/mars-weather')
  if (!res.ok) throw new Error(`Mars weather fetch failed: ${res.status}`)
  const json: unknown = await res.json()
  return MarsWeatherSchema.parse(json)
}
