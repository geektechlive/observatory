import { MarsWeatherSchema } from '@/schemas/marsWeather'
import type { MarsWeather } from '@/schemas/marsWeather'

export async function fetchMarsWeather(): Promise<MarsWeather> {
  const res = await fetch('/api/mars-weather')
  if (!res.ok) throw new Error(`Mars weather fetch failed: ${res.status}`)
  const json: unknown = await res.json()
  return MarsWeatherSchema.parse(json)
}
