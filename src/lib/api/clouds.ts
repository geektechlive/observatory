import type { Clouds } from '@/schemas/clouds'
import { CloudsSchema } from '@/schemas/clouds'

import { getJsonMeta, type SourceEnvelope } from './client'

/**
 * Open-Meteo, straight from the browser (#79): free for non-commercial use, no key,
 * CORS open. Called only after the user shares a location. It sees the visitor's IP
 * and this rounded location, nothing else; the panel says so.
 */
const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast'

export function cloudsUrl(lat: number, lon: number): string {
  const params = new URLSearchParams({
    latitude: lat.toFixed(1),
    longitude: lon.toFixed(1),
    hourly: 'cloud_cover',
    timeformat: 'unixtime',
    timezone: 'GMT',
    forecast_days: '2',
  })
  return `${OPEN_METEO}?${params.toString()}`
}

export function fetchClouds(lat: number, lon: number): Promise<SourceEnvelope<Clouds>> {
  return getJsonMeta(cloudsUrl(lat, lon), CloudsSchema)
}
