import * as satellite from 'satellite.js'

export interface IssPosition {
  lat: number
  lon: number
  alt: number
  vel: number
}

export function propagateIss(line1: string, line2: string, date: Date): IssPosition | null {
  const satrec = satellite.twoline2satrec(line1, line2)
  const result = satellite.propagate(satrec, date)
  if (typeof result.position === 'boolean' || typeof result.velocity === 'boolean') return null
  const gmst = satellite.gstime(date)
  const geo = satellite.eciToGeodetic(result.position, gmst)
  return {
    lat: satellite.degreesLat(geo.latitude),
    lon: satellite.degreesLong(geo.longitude),
    alt: geo.height,
    vel: Math.sqrt(result.velocity.x ** 2 + result.velocity.y ** 2 + result.velocity.z ** 2) * 3600,
  }
}

export function computeTrail(line1: string, line2: string, now: Date): [number, number][] {
  const points: [number, number][] = []
  const startMs = now.getTime() - 45 * 60 * 1000
  for (let i = 0; i <= 90; i++) {
    const d = new Date(startMs + i * 60 * 1000)
    const pos = propagateIss(line1, line2, d)
    if (pos !== null) {
      points.push([pos.lon, pos.lat])
    }
  }
  return points
}
