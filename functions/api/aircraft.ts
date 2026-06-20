import type { PagesFunction } from '@cloudflare/workers-types'
import { z } from 'zod'
import { cachedJson } from './_cache'

// Live aircraft from adsb.lol (open ADS-B aggregator, no key). Unlike OpenSky's
// anonymous API, this is reachable from datacenter IPs (Cloudflare egress).
// Radius queries cap at 250nm, so we sample several busy regions and merge.
const CENTERS: [number, number][] = [
  [40, -74], // New York
  [34, -118], // Los Angeles
  [41, -87], // Chicago
  [29, -95], // Houston
  [51, 0], // London
  [48, 2], // Paris
  [50, 8], // Frankfurt
  [25, 55], // Dubai
]
const RADIUS_NM = 250
const CACHE_TTL_SECONDS = 60 // 1 min
const MAX_AIRCRAFT = 700

const AcSchema = z.object({
  hex: z.string().optional(),
  flight: z.string().optional(),
  lat: z.number().optional(),
  lon: z.number().optional(),
  track: z.number().optional(),
  dir: z.number().optional(),
  alt_baro: z.union([z.number(), z.string()]).optional(),
})
const RawSchema = z.object({ ac: z.array(AcSchema).nullable().optional() })

async function fetchRegion(lat: number, lon: number): Promise<z.infer<typeof AcSchema>[]> {
  try {
    const res = await fetch(`https://api.adsb.lol/v2/lat/${lat}/lon/${lon}/dist/${RADIUS_NM}`, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) return []
    const parsed = RawSchema.safeParse(await res.json())
    return parsed.success ? (parsed.data.ac ?? []) : []
  } catch {
    return []
  }
}

export const onRequest: PagesFunction = (ctx) =>
  cachedJson(ctx, 'adsb:aircraft:v2', CACHE_TTL_SECONDS, async () => {
    const regions = await Promise.all(CENTERS.map(([lat, lon]) => fetchRegion(lat, lon)))

    const seen = new Set<string>()
    const aircraft: {
      lat: number
      lon: number
      track: number
      altM: number | null
      callsign: string
    }[] = []
    for (const region of regions) {
      for (const a of region) {
        if (typeof a.lat !== 'number' || typeof a.lon !== 'number') continue
        const key = a.hex ?? `${a.lat},${a.lon}`
        if (seen.has(key)) continue
        seen.add(key)
        if (a.alt_baro === 'ground') continue
        const altFt = typeof a.alt_baro === 'number' ? a.alt_baro : null
        aircraft.push({
          lat: a.lat,
          lon: a.lon,
          track: a.track ?? a.dir ?? 0,
          altM: altFt !== null ? Math.round(altFt * 0.3048) : null,
          callsign: a.flight?.trim() ?? '',
        })
        if (aircraft.length >= MAX_AIRCRAFT) break
      }
      if (aircraft.length >= MAX_AIRCRAFT) break
    }

    return { body: JSON.stringify({ aircraft, updatedAt: new Date().toISOString() }) }
  })
