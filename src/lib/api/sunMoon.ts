import { SunMoonSchema } from '@/schemas/sunMoon'
import type { SunMoon } from '@/schemas/sunMoon'

export interface SunMoonQuery {
  lat: number
  lon: number
  tz: number
  date: string
}

export async function fetchSunMoon({ lat, lon, tz, date }: SunMoonQuery): Promise<SunMoon> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    tz: String(tz),
    date,
  })
  const res = await fetch(`/api/sun-moon?${params.toString()}`)
  if (!res.ok) throw new Error(`Sun/Moon fetch failed: ${res.status}`)
  const json: unknown = await res.json()
  return SunMoonSchema.parse(json)
}
